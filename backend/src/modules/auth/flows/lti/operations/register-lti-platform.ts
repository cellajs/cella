import type { z } from '@hono/zod-openapi';
import { eq } from 'drizzle-orm';
import { generateId } from 'shared/utils/entity-id';
import type { DbContext } from '#/core/context';
import { AppError } from '#/core/error';
import { baseDb } from '#/db/db';
import { updateStamps } from '#/db/utils/stamps';
import { constraintErrorType } from '#/lib/error';
import { guardedFetch, vetAddress } from '#/lib/guarded-fetch';
import { ltiPlatformConfigurationMember, ltiToolConfigurationMember } from '#/lib/lti-vocabulary';
import { readHandoffToken, spendHandoffToken } from '#/modules/auth/core/tokens/token-lifecycle';
import { mintConnectionKey } from '#/modules/auth/flows/lti/helpers/connection-key';
import { type PlatformFetchOptions, parseJson } from '#/modules/auth/flows/lti/helpers/platform-fetch';
import { ltiRegistrationRequest } from '#/modules/auth/flows/lti/helpers/registration-request';
import {
  type LtiPlatformConfiguration,
  ltiPlatformConfigurationSchema,
  type ltiRegisterQuerySchema,
  ltiRegistrationResponseSchema,
} from '#/modules/auth/flows/lti/lti-schema';
import { deleteConnection, findLtiConnectionByClient, insertConnection, updateConnection } from '#/modules/connections/connections-queries';
import type { LtiConnectionConfig } from '#/modules/connections/connections-schema';
import { assertLtiConnectionRoom } from '#/modules/connections/operations/assert-lti-connection-room';
import { lockTenantQuota } from '#/modules/tenants/quota-lock';
import { tenantsTable } from '#/modules/tenants/tenants-db';
import { findTenant } from '#/modules/tenants/tenants-queries';
import { log } from '#/utils/logger';

/** The registration runs before any tenant context exists, and connections sit outside RLS. */
const dbCtx = { var: { db: baseDb } };

const invalidConfiguration = (reason: string) => new AppError(400, 'lti_configuration_invalid', 'warn', { meta: { reason } });

/** The app signs its client assertions with RS256 keys, and a launch is an RS256 ID token. */
const supportsLtiTool = (configuration: LtiPlatformConfiguration) =>
  configuration.token_endpoint_auth_methods_supported.includes('private_key_jwt') &&
  configuration.token_endpoint_auth_signing_alg_values_supported.includes('RS256') &&
  configuration.id_token_signing_alg_values_supported.includes('RS256') &&
  configuration.response_types_supported.includes('id_token');

/** Whether `url` lies under `base`: the same origin, and the base's path a prefix of its own. */
const isUnder = (url: URL, base: URL) => {
  const basePath = base.pathname.endsWith('/') ? base.pathname : `${base.pathname}/`;
  return url.origin === base.origin && url.pathname.startsWith(basePath);
};

/**
 * The configuration's address, refused where the app would not contact it: malformed, with a fragment, or failing the
 * guarded fetch's checks (`vetAddress`). Nothing is asked of the platform yet.
 * @throws AppError 400 `lti_configuration_address_refused` naming the reason.
 */
const vetConfigurationAddress = async (address: string, options: PlatformFetchOptions) => {
  const refused = (reason: unknown) => new AppError(400, 'lti_configuration_address_refused', 'warn', { meta: { reason: String(reason) } });
  const configurationUrl = URL.canParse(address) ? new URL(address) : null;
  if (!configurationUrl || configurationUrl.hash) throw refused('address');
  await vetAddress(address, options.resolve).catch((err) => {
    throw err instanceof AppError ? refused(err.meta?.reason) : err;
  });
  return configurationUrl;
};

/** A request to the platform that the guarded fetch refused or could not finish, as the registration's refusal. */
const platformUnreachable = (err: unknown) => {
  if (!(err instanceof AppError) || (err.type !== 'outbound_request_failed' && err.type !== 'outbound_request_refused')) return err;
  return new AppError(400, 'lti_platform_unreachable', 'warn', { meta: { reason: String(err.meta?.reason) } });
};

/** The platform's OpenID configuration, read from its vetted address and checked against it and its issuer. */
const fetchPlatformConfiguration = async (configurationUrl: URL, options: PlatformFetchOptions) => {
  const response = await guardedFetch(configurationUrl.href, { ...options, headers: { Accept: 'application/json' } });
  if (response.status !== 200) throw invalidConfiguration('status');

  const parsed = ltiPlatformConfigurationSchema.safeParse(parseJson(response.text));
  if (!parsed.success) throw invalidConfiguration('members');
  // A configuration served from elsewhere could name any issuer, and the app would trust launches signed in its name.
  if (!isUnder(configurationUrl, new URL(parsed.data.issuer))) throw invalidConfiguration('issuer');
  if (!supportsLtiTool(parsed.data)) throw new AppError(400, 'lti_platform_unsupported', 'warn', { meta: { issuer: parsed.data.issuer } });
  return parsed.data;
};

interface RegistrationCall {
  configuration: LtiPlatformConfiguration;
  connectionId: string;
  registrationToken: string | undefined;
}

/** Registers the app at the platform's registration endpoint for one connection, with the platform's token when it gave one. */
const registerAtPlatform = async ({ configuration, connectionId, registrationToken }: RegistrationCall, options: PlatformFetchOptions) => {
  const response = await guardedFetch(configuration.registration_endpoint, {
    ...options,
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(registrationToken ? { Authorization: `Bearer ${registrationToken}` } : {}),
    },
    body: JSON.stringify(ltiRegistrationRequest(connectionId)),
  });
  const refused = (reason: string) =>
    new AppError(400, 'lti_registration_refused', 'warn', { meta: { reason, platformStatus: response.status, issuer: configuration.issuer } });
  if (response.status !== 200 && response.status !== 201) throw refused('status');

  const parsed = ltiRegistrationResponseSchema.safeParse(parseJson(response.text));
  if (!parsed.success) throw refused('members');
  return parsed.data;
};

/**
 * The link's tenant, refused while it holds as many LTI connections as its quota allows (`assertLtiConnectionRoom`).
 * @throws AppError 401 `lti-registration_not_found` for a tenant gone since the link was made, 403 `lti_connection_limit`.
 */
const assertTenantRoom = async (ctx: DbContext, tenantId: string) => {
  const tenant = await findTenant(ctx, { where: eq(tenantsTable.id, tenantId) });
  if (!tenant) throw new AppError(401, 'lti-registration_not_found', 'warn');
  await assertLtiConnectionRoom(ctx, tenant);
};

/**
 * A client id the platform gave before, refused by the unique pair of issuer and client id across tenants
 * (`lti_client_id_taken`). Only a connection of this tenant is named to its admin; another tenant's stays unnamed.
 * @returns The error to throw: `lti_platform_already_connected` for this tenant's connection, else `err` itself.
 */
const takenClientIdRefusal = async (err: unknown, { tenantId, issuer, clientId }: { tenantId: string; issuer: string; clientId: string }) => {
  if (constraintErrorType(err) !== 'lti_client_id_taken') return err;
  const holder = await findLtiConnectionByClient(dbCtx, { issuer, clientId });
  if (holder?.tenantId !== tenantId) return err;
  return new AppError(409, 'lti_platform_already_connected', 'warn', { meta: { issuer } });
};

/**
 * Registers the app as an LTI tool at a platform by Dynamic Registration, from the frame the platform opened the
 * registration link in. What the app decides alone comes first, and leaves the link for another try: a link unknown or
 * expired, a tenant at its quota of LTI connections, and a configuration address it does not contact. Every outcome
 * after the first request to the platform takes a new link: the link is spent before it. The platform's configuration
 * is read and checked, and the connection is stored `pending` with a key pair of its own (`mintConnectionKey`), for the
 * link's tenant and written by the admin who created the link, under the tenant's quota lock. Its key set answers from
 * then on: a platform such as Brightspace reads it while it handles the registration. The app registers with that key
 * set, and the connection turns active with the client id the platform gave; a refused registration deletes it.
 * @throws AppError 401 `lti-registration_not_found` or `lti-registration_expired`, 400
 *   `lti_configuration_address_refused` with the link left; with the link spent 400 `lti_configuration_invalid`,
 *   `lti_platform_unreachable`, `lti_platform_unsupported` or `lti_registration_refused`; 403 `lti_connection_limit`
 *   before the spend and `lti_connection_limit_link_used` after it; 409 `lti_platform_already_connected` or
 *   `lti_client_id_taken` (`takenClientIdRefusal`).
 */
export const registerLtiPlatformOp = async (query: z.infer<typeof ltiRegisterQuerySchema>, options: PlatformFetchOptions = {}) => {
  const kind = 'lti-registration';
  const link = await readHandoffToken({ kind, rawToken: query.link });
  // Read without the quota lock, which the insert takes: this check only spares the link, the insert's decides.
  await assertTenantRoom(dbCtx, link.tenantId);
  const configurationUrl = await vetConfigurationAddress(query.openid_configuration, options);
  await spendHandoffToken({ kind, rawToken: query.link, id: link.id });

  const configuration = await fetchPlatformConfiguration(configurationUrl, options).catch((err) => {
    throw platformUnreachable(err);
  });
  const platform = configuration[ltiPlatformConfigurationMember];
  const id = generateId();
  const config: LtiConnectionConfig = {
    authorizationEndpoint: configuration.authorization_endpoint,
    tokenEndpoint: configuration.token_endpoint,
    ...(configuration.authorization_server ? { authorizationServer: configuration.authorization_server } : {}),
    jwksUri: configuration.jwks_uri,
    productFamilyCode: platform.product_family_code,
    version: platform.version,
    deploymentIds: [],
  };
  const privateJwk = await mintConnectionKey(id);
  await baseDb.transaction(async (tx) => {
    const txCtx = { var: { db: tx } };
    await lockTenantQuota(txCtx, { tenantId: link.tenantId, key: 'ltiConnection' });
    // Another registration took the last slot since the first check: the link is spent by now.
    await assertTenantRoom(txCtx, link.tenantId).catch((err) => {
      if (err instanceof AppError && err.type === 'lti_connection_limit')
        throw new AppError(403, 'lti_connection_limit_link_used', 'info', { meta: err.meta });
      throw err;
    });
    await insertConnection(txCtx, {
      values: {
        id,
        tenantId: link.tenantId,
        kind: 'lti',
        issuer: configuration.issuer,
        name: new URL(configuration.issuer).host,
        status: 'pending',
        config,
        privateJwk,
        createdBy: link.createdBy,
      },
    });
  });

  try {
    const registration = await registerAtPlatform({ configuration, connectionId: id, registrationToken: query.registration_token }, options).catch(
      (err) => {
        throw platformUnreachable(err);
      },
    );
    // Canvas names the deployment beside the client id, others inside the LTI tool configuration.
    const deploymentId = registration[ltiToolConfigurationMember]?.deployment_id ?? registration.deployment_id;
    const taken = { tenantId: link.tenantId, issuer: configuration.issuer, clientId: registration.client_id };
    const connection = await updateConnection(dbCtx, {
      id,
      tenantId: link.tenantId,
      values: {
        clientId: registration.client_id,
        status: 'active',
        config: {
          ...config,
          ...(registration.registration_client_uri ? { registrationClientUri: registration.registration_client_uri } : {}),
          deploymentIds: deploymentId ? [deploymentId] : [],
        },
        ...(link.createdBy && updateStamps(link.createdBy)),
      },
    }).catch(async (err) => {
      throw await takenClientIdRefusal(err, taken);
    });
    if (!connection) throw new AppError(404, 'not_found', 'warn', { meta: { resource: 'connection' } });
    log.info('LTI connection registered', { connectionId: id, tenantId: connection.tenantId, issuer: configuration.issuer });
    return connection;
  } catch (error) {
    await deleteConnection(dbCtx, { id, tenantId: link.tenantId });
    throw error;
  }
};
