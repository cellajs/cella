import type { Context } from 'hono';
import type { Actor, Env } from '#/core/context';
import { AppError } from '#/core/error';
import { xMiddleware } from '#/core/x-middleware';
import { baseDb } from '#/db/db';
import { loadCachedApiKey } from '#/middlewares/guard/api-key-cache';
import { loadMemberships } from '#/middlewares/guard/membership-cache';
import { routeTarget } from '#/middlewares/guard/route-target';
import { loadCachedTokenGrant, type TokenGrantEntry, type UserToken } from '#/middlewares/guard/token-grant-cache';
import { serviceBurstLimiter } from '#/middlewares/rate-limiter/limiters';
import { updateLastSeenAt } from '#/middlewares/update-last-seen';
import { grantRefusal } from '#/modules/oauth-server/grant-policy';
import { findLiveGrantBindings } from '#/modules/oauth-server/oauth-server-queries';
import { bearerChallenge, type ResourceRef } from '#/modules/oauth-server/resources';
import { bearerJwtFrom, type VerifiedAccessToken, verifyAccessToken } from '#/modules/oauth-server/verify-access-token';
import { apiKeyFrom, apiKeyRefusal, parseApiKey } from '#/modules/service-accounts/helpers/api-key';
import type { ServiceAccountModel } from '#/modules/service-accounts/service-accounts-db';
import { findApiKeyWithAccount } from '#/modules/service-accounts/service-accounts-queries';
import type { UserModel } from '#/modules/user/user-db';
import { findUserModelsByIds } from '#/modules/user/user-queries';

/** The 401 that refuses a machine proof, naming why in `meta.reason`. */
export const unauthorized = (reason: string) => new AppError(401, 'unauthorized', 'warn', { meta: { reason } });

/**
 * Runs a guard's check of a key or token. A 401 it throws carries the challenge of a refused proof, `invalid_token` with
 * the reason, so a client knows to get a new one (RFC 6750 §3.1).
 */
export const challengeRefusal = async (ctx: Context<Env>, ref: ResourceRef, check: () => Promise<void>): Promise<void> => {
  try {
    await check();
  } catch (error) {
    if (error instanceof AppError && error.status === 401) {
      const description = String(error.meta?.reason ?? 'invalid_token');
      ctx.header('WWW-Authenticate', bearerChallenge(ref, { error: 'invalid_token', description }));
    }
    throw error;
  }
};

/** A service account acts with its stored bindings, masked by the scopes of the key or token; no machine proof is system admin. */
const setServiceActor = (ctx: Context<Env>, account: ServiceAccountModel, scopes: Actor['scopes']) => {
  ctx.set('actor', { kind: 'service', id: account.id, tenantId: account.tenantId, bindings: account.bindings, scopes });
  ctx.set('isSystemAdmin', false);
  ctx.set('db', baseDb);
};

/**
 * A token from the app's own authorization server: verified locally, bound to this route's tenant, it runs as
 * the user who consented (masked by the token's scopes) or as the service account behind a `client_credentials`
 * grant, and only while the grant policy holds the grant or API key it names. Tokens and keys never carry system
 * admin: that stays with a session and its IP allow-list.
 */
export const setActorFromToken = async (ctx: Context<Env>, jwt: string, scope: { tenantId: string; organizationId?: string }): Promise<void> => {
  const token = await verifyAccessToken(jwt, scope);

  if (token.kind === 'user') {
    const { user, bindingsVersion } = await resolveUserToken(token);
    const memberships = await loadMemberships(user.id, bindingsVersion);
    ctx.set('user', user);
    ctx.set('memberships', memberships);
    ctx.set('actor', {
      kind: 'user',
      id: user.id,
      bindings: memberships,
      scopes: token.scopes,
      authStrategy: token.authStrategy,
      connectionId: token.connectionId,
    });
    ctx.set('isSystemAdmin', false);
    ctx.set('db', baseDb);
  } else {
    setServiceActor(ctx, await resolveServiceToken(token), token.scopes);
  }
};

/**
 * A person's token: the grant it names and the user's bindings version are read at every use, so a revoked grant
 * stops the token and a membership change narrows it at the next request in every process. The grant policy's verdict
 * with the user row is cached per grant, tenant and bindings version (`token-grant-cache.ts`).
 */
const resolveUserToken = async (token: UserToken): Promise<{ user: UserModel; bindingsVersion: string }> => {
  const live = await findLiveGrantBindings({ var: { db: baseDb } }, { grantId: token.grantId, userId: token.actorId });
  if (!live) throw unauthorized('grant_revoked');

  const { bindingsVersion } = live;
  const entry = await loadCachedTokenGrant(token, bindingsVersion, () => readTokenGrant(token));
  if (entry.refusal !== null) throw unauthorized(entry.refusal);
  return { user: entry.user, bindingsVersion };
};

/** The grant policy's verdict on a live grant, with the user row. */
const readTokenGrant = async (token: UserToken): Promise<TokenGrantEntry> => {
  const refusal = await grantRefusal({ userId: token.actorId, clientId: token.clientId, tenantId: token.tenantId });
  const [user] = refusal ? [] : await findUserModelsByIds({ var: { db: baseDb } }, { ids: [token.actorId] });
  return user ? { refusal: null, user } : { refusal: refusal ?? 'unknown_user' };
};

/**
 * A service account's token: the key it was minted with and its account, read in one statement at every use, so a
 * revoked or expired key or a disabled account stops it at the next request in every process.
 */
const resolveServiceToken = async (token: Extract<VerifiedAccessToken, { kind: 'service' }>) => {
  const found = await findApiKeyWithAccount({ var: { db: baseDb } }, { key: { id: token.keyId }, actorId: token.actorId });
  if (!found) throw unauthorized('invalid_api_key');
  const refusal = apiKeyRefusal(found.apiKey, found.account);
  if (refusal) throw unauthorized(refusal);
  updateLastSeenAt(found.account.id);
  return found.account;
};

/** The key and its account in one read, cached by hash; a revoke, roll, or disable invalidates the account's keys. */
const resolveApiKey = (hash: string) => loadCachedApiKey(hash, () => findApiKeyWithAccount({ var: { db: baseDb } }, { key: { hash } }));

/** A secret key runs as its service account, masked by the key's scopes. */
const setActorFromApiKey = async (ctx: Context<Env>, raw: string): Promise<void> => {
  const parsed = parseApiKey(raw);
  if (parsed?.type !== 'secret') throw unauthorized('invalid_api_key');

  const resolved = await resolveApiKey(parsed.hash);
  if (!resolved) throw unauthorized('invalid_api_key');
  const refusal = apiKeyRefusal(resolved.apiKey, resolved.account);
  if (refusal) throw unauthorized(refusal);
  const { apiKey, account } = resolved;
  updateLastSeenAt(account.id);
  setServiceActor(ctx, account, apiKey.scopes);
};

/**
 * Authenticates a machine caller by API key or access token and sets the actor: a secret API key runs as its service account; a token from
 * the app's own authorization server runs as the consenting user or the account behind it. Tenant resolution stays
 * with `tenantGuard`, which checks the URL against the actor's tenant. Sessions never reach this guard, and an API key
 * sent from a browser page is refused.
 */
export const serviceGuard = xMiddleware(
  {
    functionName: 'serviceGuard',
    type: 'x-guard',
    errors: [401, 403],
    security: [{ apiKey: [] }, { oauth2: [] }],
    provides: ['actor'],
    limiters: [serviceBurstLimiter],
    name: 'Service',
    description:
      'Works with a secret API key or an access token, no session. The request acts as the service account, or the user who gave consent, within the scopes granted.',
  },
  async (ctx, next) => {
    const target = routeTarget(ctx);
    const ref: ResourceRef = { face: 'api', tenantId: target.tenantId };
    const jwt = bearerJwtFrom(ctx);
    if (jwt) {
      await challengeRefusal(ctx, ref, () => setActorFromToken(ctx, jwt, target));
      return serviceBurstLimiter(ctx, next);
    }

    const raw = apiKeyFrom(ctx);
    if (!raw) {
      ctx.header('WWW-Authenticate', bearerChallenge(ref));
      throw unauthorized('missing_api_key');
    }

    // Secret keys are for servers: a request from a browser page carries an Origin and is refused outright.
    if (ctx.req.header('origin')) throw new AppError(403, 'forbidden', 'warn', { meta: { reason: 'browser_origin' } });

    await challengeRefusal(ctx, ref, () => setActorFromApiKey(ctx, raw));
    return serviceBurstLimiter(ctx, next);
  },
);
