import type { z } from '@hono/zod-openapi';
import { AppError } from '#/core/error';
import { baseDb } from '#/db/db';
import { issueHandoffToken } from '#/modules/auth/core/tokens/token-lifecycle';
import { encodeLaunchState, ltiStorageKey } from '#/modules/auth/flows/lti/helpers/launch-state';
import type { StorageExchange } from '#/modules/auth/flows/lti/helpers/platform-storage-pages';
import { ltiLaunchUrl } from '#/modules/auth/flows/lti/helpers/registration-request';
import type { ltiLoginParamsSchema } from '#/modules/auth/flows/lti/lti-schema';
import { findActiveLtiConnections } from '#/modules/connections/connections-queries';
import { log } from '#/utils/logger';

/** Connections and tokens sit outside RLS, and a login runs before any tenant context exists. */
const dbCtx = { var: { db: baseDb } };

/**
 * A platform's login initiation (1EdTech Security Framework 1.0, section 5.1.1). Finds the active connection by issuer
 * and client id (without a client id, the issuer's only one), issues a one-use `lti-nonce` and answers the exchange
 * that puts its value into platform storage, then sends the browser to the stored authorization endpoint with the
 * authentication request. Nothing of the address comes from the request: the redirect is the registered launch
 * address, and the hints go back as received.
 * @throws AppError 401 `lti_platform_unknown` for an issuer and client id of no active connection, 400
 *   `lti_storage_missing` when the platform names no storage frame, 401 `lti_launch_invalid` without a login hint.
 */
export async function initiateLtiLoginOp(params: z.infer<typeof ltiLoginParamsSchema>): Promise<StorageExchange> {
  const { iss: issuer, client_id: clientId, login_hint: loginHint, lti_message_hint: messageHint, lti_storage_target: target } = params;
  const connections = issuer ? await findActiveLtiConnections(dbCtx, { issuer, clientIds: clientId ? [clientId] : undefined }) : [];
  // Two connections of one issuer and no client id leave the login ambiguous.
  if (connections.length !== 1) throw new AppError(401, 'lti_platform_unknown', 'warn', { meta: { issuer: issuer ?? null } });
  const [connection] = connections;
  const authorization = new URL(connection.config.authorizationEndpoint);

  // Launch state lives in platform storage alone: a platform without it cannot launch the app.
  if (!target) throw new AppError(400, 'lti_storage_missing', 'warn', { meta: { connectionId: connection.id } });
  if (!loginHint) throw new AppError(401, 'lti_launch_invalid', 'warn', { meta: { rule: 'login_hint', connectionId: connection.id } });

  const nonce = await issueHandoffToken(dbCtx, { kind: 'lti-nonce', tenantId: connection.tenantId, connectionId: connection.id });
  const request = {
    scope: 'openid',
    response_type: 'id_token',
    response_mode: 'form_post',
    prompt: 'none',
    client_id: connection.clientId,
    redirect_uri: ltiLaunchUrl(),
    login_hint: loginHint,
    ...(messageHint && { lti_message_hint: messageHint }),
    nonce: nonce.id,
    state: encodeLaunchState({ nonce: nonce.id, target, connection: connection.id }),
  };
  for (const [name, value] of Object.entries(request)) authorization.searchParams.set(name, value);

  log.info('LTI login', { connectionId: connection.id, tenantId: connection.tenantId });
  return {
    subject: 'lti.put_data',
    target,
    origin: authorization.origin,
    key: ltiStorageKey(nonce.id),
    value: nonce.rawToken,
    next: authorization.href,
  };
}
