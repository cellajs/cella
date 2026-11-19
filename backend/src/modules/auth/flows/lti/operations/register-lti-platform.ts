import type { z } from '@hono/zod-openapi';
import { AppError } from '#/core/error';
import { baseDb } from '#/db/db';
import { guardedFetch } from '#/lib/guarded-fetch';
import { ltiPlatformConfigurationMember, ltiToolConfigurationMember } from '#/lib/lti-vocabulary';
import { spendHandoffToken } from '#/modules/auth/core/tokens/token-lifecycle';
import { isUnder, type PlatformFetchOptions } from '#/modules/auth/flows/lti/helpers/platform-api';
import { ltiRegistrationRequest } from '#/modules/auth/flows/lti/helpers/registration-request';
import {
  type LtiPlatformConfiguration,
  ltiPlatformConfigurationSchema,
  type ltiRegisterQuerySchema,
  ltiRegistrationResponseSchema,
} from '#/modules/auth/flows/lti/lti-schema';
import { provisionConnectionActor } from '#/modules/auth/flows/lti/operations/provision-connection-actor';
import { isLtiConnection } from '#/modules/connections/connections-db';
import { insertConnection } from '#/modules/connections/connections-queries';
import { log } from '#/utils/logger';

const invalidConfiguration = (reason: string) => new AppError(400, 'lti_configuration_invalid', 'warn', { meta: { reason } });

/** The app signs its client assertions with RS256 keys, and a launch is an RS256 ID token. */
const supportsLtiTool = (configuration: LtiPlatformConfiguration) =>
  configuration.token_endpoint_auth_methods_supported.includes('private_key_jwt') &&
  configuration.token_endpoint_auth_signing_alg_values_supported.includes('RS256') &&
  configuration.id_token_signing_alg_values_supported.includes('RS256') &&
  configuration.response_types_supported.includes('id_token');

const parseJson = (text: string): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
};

/** The platform's OpenID configuration, read from its address and checked against it. */
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

/** Registers the app at the platform's registration endpoint, with the platform's token when it gave one. */
const registerAtPlatform = async (configuration: LtiPlatformConfiguration, registrationToken: string | undefined, options: PlatformFetchOptions) => {
  const response = await guardedFetch(configuration.registration_endpoint, {
    ...options,
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(registrationToken ? { Authorization: `Bearer ${registrationToken}` } : {}),
    },
    body: JSON.stringify(ltiRegistrationRequest()),
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
 * is read and checked, the app registers, and the connection is stored for the link's tenant, written by the admin who
 * created the link, with the service account the connection writes as.
 * @throws AppError 401 `lti-registration_not_found` or `lti-registration_expired`, 400 `lti_configuration_invalid`,
 *   `lti_platform_unsupported` or `lti_registration_refused`, what `guardedFetch` throws, and 409 when the platform
 *   already registered this client id.
 */
export const registerLtiPlatformOp = async (query: z.infer<typeof ltiRegisterQuerySchema>, options: PlatformFetchOptions = {}) => {
  const link = await spendHandoffToken({ kind: 'lti-registration', rawToken: query.link });

  const configuration = await fetchPlatformConfiguration(query.openid_configuration, options);
  const registration = await registerAtPlatform(configuration, query.registration_token, options);

  const platform = configuration[ltiPlatformConfigurationMember];
  const deploymentId = registration[ltiToolConfigurationMember]?.deployment_id;
  // The registration runs before any tenant context exists, and connections sit outside RLS.
  const connection = await baseDb.transaction(async (tx) => {
    const txCtx = { var: { db: tx } };
    const inserted = await insertConnection(txCtx, {
      values: {
        tenantId: link.tenantId,
        kind: 'lti',
        issuer: configuration.issuer,
        clientId: registration.client_id,
        name: new URL(configuration.issuer).host,
        status: 'active',
        config: {
          authorizationEndpoint: configuration.authorization_endpoint,
          tokenEndpoint: configuration.token_endpoint,
          ...(configuration.authorization_server ? { authorizationServer: configuration.authorization_server } : {}),
          jwksUri: configuration.jwks_uri,
          ...(registration.registration_client_uri ? { registrationClientUri: registration.registration_client_uri } : {}),
          productFamilyCode: platform.product_family_code,
          version: platform.version,
          deploymentIds: deploymentId ? [deploymentId] : [],
        },
        createdBy: link.createdBy,
      },
    });
    if (isLtiConnection(inserted)) await provisionConnectionActor(txCtx, inserted);
    return inserted;
  });

  log.info('LTI connection registered', { connectionId: connection.id, tenantId: connection.tenantId, issuer: configuration.issuer });
  return connection;
};
