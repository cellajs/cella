import type { Context } from 'hono';
import { generateRandomCodeVerifier, generateRandomNonce, generateRandomState } from 'oauth4webapi';
import type z from 'zod';
import type { Env } from '#/core/context';
import { AppError } from '#/core/error';
import { baseDb } from '#/db/db';
import type { oauthQuerySchema } from '#/modules/auth/oauth/oauth-schema';
import { handleOAuthInitiation } from '#/modules/auth/oauth/operations/initiation';
import { createFederationAuthorizationUrl } from '#/modules/auth/sso/helpers/federation-client';
import { type Federation, getFederation, isFederationKey } from '#/modules/auth/sso/helpers/federations';
import { findConnectionById } from '#/modules/connections/connections-queries';

const dbCtx = { var: { db: baseDb } };

type StartContext = Context<Env, string, { out: { query: z.infer<typeof oauthQuerySchema> } }>;

/** Where an SSO round trip starts: an institution's connection (pinned to its IdPs), or a federation at large. */
export type SsoTarget = { connectionId: string } | { federation: string };

/**
 * Starts an SSO round trip: resolves the federation (and the connection, when the start names one), builds its
 * authorization URL and stores the round trip's state, verifier, nonce and connection in the state cookie.
 * @throws AppError 404 `not_found` for an unknown connection or federation, 403 `sso_not_active` for a connection
 *   that is not active, 400 `invalid_request` for a flow type SSO does not run, and `getFederation`'s refusal.
 */
export const startSso = async (ctx: StartContext, target: SsoTarget) => {
  const { type } = ctx.req.valid('query');
  // No verification mail (the assertion is the proof) and no invitation pinning (an invitation resumes after the sign-in).
  if (type !== 'auth' && type !== 'connect') throw new AppError(400, 'invalid_request', 'warn', { meta: { reason: `SSO has no ${type} flow` } });

  let federation: Federation;
  let connectionId: string | undefined;
  let loginHint: string | undefined;

  if ('connectionId' in target) {
    const connection = await findConnectionById(dbCtx, { id: target.connectionId });
    if (connection?.kind !== 'sso' || !isFederationKey(connection.issuer)) {
      throw new AppError(404, 'not_found', 'warn', { meta: { resource: 'connection' } });
    }
    // Refused here, before the redirect: the federation's own refusal pages never return to the app.
    if (connection.status !== 'active') throw new AppError(403, 'sso_not_active', 'warn', { meta: { connectionId: connection.id } });

    federation = getFederation(connection.issuer);
    connectionId = connection.id;
    loginHint = connection.config.idpEntityIds?.join(',') || undefined;
  } else {
    if (!isFederationKey(target.federation)) throw new AppError(404, 'not_found', 'warn', { meta: { resource: 'federation' } });
    federation = getFederation(target.federation);
  }

  const state = generateRandomState();
  const codeVerifier = generateRandomCodeVerifier();
  const nonce = generateRandomNonce();
  const url = await createFederationAuthorizationUrl(federation, { state, codeVerifier, nonce, loginHint });

  return handleOAuthInitiation(ctx, federation.key, url, state, codeVerifier, nonce, { connectionId });
};
