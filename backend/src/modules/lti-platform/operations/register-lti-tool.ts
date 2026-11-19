import { type AccessScope, accessScopes } from 'shared';
import { generateId } from 'shared/utils/entity-id';
import { AppError } from '#/core/error';
import { baseDb } from '#/db/db';
import { ltiToolConfigurationMember } from '#/lib/lti-vocabulary';
import { spendHandoffToken } from '#/modules/auth/core';
import { launchOrigins } from '#/modules/lti-platform/helpers/launch-message';
import { ltiClaimsSupported, ltiMessageTypes } from '#/modules/lti-platform/helpers/platform-offer';
import { insertLtiToolRegistration } from '#/modules/lti-platform/lti-platform-queries';
import { ltiToolScopes } from '#/modules/lti-platform/lti-platform-routes';
import { type LtiToolConfig, type LtiToolRegistrationRequest, ltiToolRegistrationRequestSchema } from '#/modules/lti-platform/lti-platform-schema';
import { findOrganizationByTenant } from '#/modules/organization/organization-queries';
import { log } from '#/utils/logger';

const metadataInvalid = (member: string) => new AppError(400, 'lti_tool_metadata_invalid', 'warn', { meta: { member } });

/** Whether an address lies on one of the domains the LTI tool declares. */
const isOnDomains = (address: string, domains: string[]) => {
  const { host, hostname } = new URL(address);
  return domains.some((domain) => domain.toLowerCase() === host || domain.toLowerCase() === hostname);
};

/**
 * The request, checked against what the platform offers. Each of the LTI tool's launch addresses and its key set
 * address must lie on the domains it declares; the admin approves their origins (`launchOrigins`, `keySetOrigin`):
 * where a launch posts a person's claims, and whose keys mint the installation's tokens. Of its messages, claims and
 * access scopes, the platform records the ones it supports; scopes only those its routes read (`ltiToolScopes`), and
 * only beside the `client_credentials` grant its tokens are requested with.
 * @throws AppError 400 `lti_tool_metadata_invalid` naming the first member refused.
 */
const parseRegistrationRequest = (body: unknown) => {
  const parsed = ltiToolRegistrationRequestSchema.safeParse(body);
  if (!parsed.success) throw metadataInvalid(parsed.error.issues[0]?.path.map(String).join('.') || 'body');
  const request = parsed.data;
  const config = request[ltiToolConfigurationMember];

  const domains = [config.domain, ...(config.secondary_domains ?? [])];
  const messages = config.messages.filter(({ type }) => ltiMessageTypes.includes(type));
  const origins = launchOrigins({
    initiateLoginUri: request.initiate_login_uri,
    redirectUris: request.redirect_uris,
    ltiToolConfig: { ...config, messages },
  });
  if (!origins.every((origin) => isOnDomains(origin, domains))) throw metadataInvalid('domain');
  if (!isOnDomains(request.jwks_uri, domains)) throw metadataInvalid('jwks_uri');
  if (!messages.length) throw metadataInvalid('messages');

  const recorded: LtiToolConfig = { ...config, messages, claims: config.claims.filter((claim) => ltiClaimsSupported.includes(claim)) };
  const asked = request.grant_types.includes('client_credentials') ? accessScopes.parse(request.scope) : [];
  const requestedScopes = ltiToolScopes.filter((scope) => asked.includes(scope));
  return { request, recorded, requestedScopes };
};

interface RecordedRegistration {
  request: LtiToolRegistrationRequest;
  recorded: LtiToolConfig;
  requestedScopes: AccessScope[];
}

/**
 * The registration as the platform recorded it (section 3.6.1), with the installation as its LTI deployment. The
 * platform serves no LTI service: beside the launch it registers the token grant for the access scopes it recorded,
 * which an admin may grant the installation.
 */
const registrationResponse = ({ request, recorded, requestedScopes }: RecordedRegistration, clientId: string, deploymentId: string) => ({
  client_id: clientId,
  application_type: request.application_type,
  grant_types: requestedScopes.length ? ['implicit', 'client_credentials'] : ['implicit'],
  ...(requestedScopes.length > 0 && { scope: requestedScopes.join(' ') }),
  response_types: request.response_types,
  redirect_uris: request.redirect_uris,
  initiate_login_uri: request.initiate_login_uri,
  client_name: request.client_name,
  jwks_uri: request.jwks_uri,
  ...(request.logo_uri && { logo_uri: request.logo_uri }),
  token_endpoint_auth_method: request.token_endpoint_auth_method,
  id_token_signed_response_alg: 'RS256',
  [ltiToolConfigurationMember]: { ...recorded, deployment_id: deploymentId },
});

/**
 * Registers an LTI tool by Dynamic Registration at the issuer. The registration token is spent, the request checked,
 * and the registration and its pending installation stored, in one transaction: a refused request leaves the token
 * for a corrected one, and of two requests presenting it, one registers. The registration is private to the token's
 * tenant and written by the admin who started it.
 * @throws AppError 401 `lti-tool-registration_not_found` or `lti-tool-registration_expired`, also when the tenant no
 *   longer holds its organization; 400 `lti_tool_metadata_invalid`.
 */
export async function registerLtiToolOp({ registrationToken, body }: { registrationToken: string; body: unknown }) {
  return baseDb.transaction(async (tx) => {
    const txCtx = { var: { db: tx } };
    const token = await spendHandoffToken({ kind: 'lti-tool-registration', rawToken: registrationToken, txCtx });
    const registration = parseRegistrationRequest(body);
    const { request, recorded, requestedScopes } = registration;
    const organization = await findOrganizationByTenant(txCtx, { tenantId: token.tenantId });
    if (!organization) throw new AppError(401, 'lti-tool-registration_not_found', 'warn', { meta: { tokenId: token.id } });

    const clientId = generateId();
    const installation = await insertLtiToolRegistration(txCtx, {
      organizationId: organization.id,
      client: {
        id: clientId,
        tenantId: token.tenantId,
        name: request.client_name,
        redirectUris: request.redirect_uris,
        logoUri: request.logo_uri,
        jwksUri: request.jwks_uri,
        initiateLoginUri: request.initiate_login_uri,
        ltiToolConfig: recorded,
        requestedScopes,
        createdBy: token.createdBy,
      },
    });

    log.info('LTI tool registered', { clientId, installationId: installation.id, tenantId: token.tenantId, domain: recorded.domain });
    return registrationResponse(registration, clientId, installation.id);
  });
}
