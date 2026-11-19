import type { z } from '@hono/zod-openapi';
import { generateId } from 'shared/utils/entity-id';
import { AppError } from '#/core/error';
import { baseDb } from '#/db/db';
import { updateStamps } from '#/db/utils/stamps';
import { guardedFetch } from '#/lib/guarded-fetch';
import { ltiPlatformConfigurationMember, ltiToolConfigurationMember } from '#/lib/lti-vocabulary';
import { spendHandoffToken } from '#/modules/auth/core/tokens/token-lifecycle';
import { mintConnectionKey } from '#/modules/auth/flows/lti/helpers/connection-key';
import { type PlatformFetchOptions, parseJson } from '#/modules/auth/flows/lti/helpers/platform-fetch';
import { ltiRegistrationRequest } from '#/modules/auth/flows/lti/helpers/registration-request';
import {
  type LtiPlatformConfiguration,
  ltiPlatformConfigurationSchema,
  type ltiRegisterQuerySchema,
  ltiRegistrationResponseSchema,
} from '#/modules/auth/flows/lti/lti-schema';
import { deleteConnection, insertConnection, updateConnection } from '#/modules/connections/connections-queries';
import type { LtiConnectionConfig } from '#/modules/connections/connections-schema';
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

/** The platform's OpenID configuration, read from its address and checked against it and its issuer. */
const fetchPlatformConfiguration = async (address: string, options: PlatformFetchOptions) => {
  const configurationUrl = URL.canParse(address) ? new URL(address) : null;
  if (!configurationUrl || configurationUrl.hash) throw invalidConfiguration('address');

  const response = await guardedFetch(address, { ...options, headers: { Accept: 'application/json' } });
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
 * Registers the app as an LTI tool at a platform by Dynamic Registration, from the frame the platform opened the
 * registration link in. The link is spent first, so any outcome takes a new one. Then the platform's configuration
 * is read and checked, and the connection is stored `pending` with a key pair of its own (`mintConnectionKey`), for
 * the link's tenant and written by the admin who created the link. Its key set answers from then on: a platform such
 * as Brightspace reads it while it handles the registration. The app registers with that key set, and the connection
 * turns active with the client id the platform gave; a refused registration deletes it.
 * @throws AppError 401 `lti-registration_not_found` or `lti-registration_expired`, 400 `lti_configuration_invalid`,
 *   `lti_platform_unsupported` or `lti_registration_refused`, what `guardedFetch` throws, and 409 when the platform
 *   already registered this client id.
 */
export const registerLtiPlatformOp = async (query: z.infer<typeof ltiRegisterQuerySchema>, options: PlatformFetchOptions = {}) => {
  const link = await spendHandoffToken({ kind: 'lti-registration', rawToken: query.link });

  const configuration = await fetchPlatformConfiguration(query.openid_configuration, options);
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
  await insertConnection(dbCtx, {
    values: {
      id,
      tenantId: link.tenantId,
      kind: 'lti',
      issuer: configuration.issuer,
      name: new URL(configuration.issuer).host,
      status: 'pending',
      config,
      privateJwk: await mintConnectionKey(id),
      createdBy: link.createdBy,
    },
  });

  try {
    const registration = await registerAtPlatform({ configuration, connectionId: id, registrationToken: query.registration_token }, options);
    const deploymentId = registration[ltiToolConfigurationMember]?.deployment_id;
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
    });
    if (!connection) throw new AppError(404, 'not_found', 'warn', { meta: { resource: 'connection' } });
    log.info('LTI connection registered', { connectionId: id, tenantId: connection.tenantId, issuer: configuration.issuer });
    return connection;
  } catch (error) {
    await deleteConnection(dbCtx, { id, tenantId: link.tenantId });
    throw error;
  }
};
