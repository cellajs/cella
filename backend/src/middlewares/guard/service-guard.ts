import { eq } from 'drizzle-orm';
import type { Context } from 'hono';
import type { Env } from '#/core/context';
import { AppError } from '#/core/error';
import { xMiddleware } from '#/core/x-middleware';
import { baseDb } from '#/db/db';
import { getApiKeyCache, setApiKeyCache } from '#/middlewares/guard/api-key-cache';
import { loadMemberships } from '#/middlewares/guard/auth-cache';
import { getTokenGrantCache, setTokenGrantCache, type TokenGrantEntry } from '#/middlewares/guard/token-grant-cache';
import { serviceBurstLimiter } from '#/middlewares/rate-limiter/limiters';
import { grantRefusal } from '#/modules/oauth-server/grant-policy';
import { findConsentOfUser } from '#/modules/oauth-server/oauth-server-queries';
import { resourceMetadataUrl } from '#/modules/oauth-server/resources';
import { bearerJwtFrom, type VerifiedAccessToken, verifyAccessToken } from '#/modules/oauth-server/verify-access-token';
import { apiKeyFrom, apiKeyRefusal, parseApiKey } from '#/modules/service-accounts/helpers/api-key';
import { findApiKeyWithAccount } from '#/modules/service-accounts/service-accounts-queries';
import { usersTable } from '#/modules/user/user-db';

export const unauthorized = (reason: string) => new AppError(401, 'unauthorized', 'warn', { meta: { reason } });

/** The route's tenant and organization ids as the URL carries them; every machine guard binds the key or token to them. */
export function routeTarget(ctx: Context<Env>): { tenantId: string; organizationId?: string } {
  const tenantId = ctx.req.param('tenantId')?.toLowerCase();
  if (!tenantId) throw new AppError(400, 'invalid_request', 'error', { meta: { reason: 'Missing tenantId parameter' } });
  return { tenantId, organizationId: ctx.req.param('organizationId') };
}

/**
 * A token from the app's own authorization server (D12): verified locally, bound to this route's tenant, it runs as
 * the user who consented (masked by the token's scopes) or as the service account behind a `client_credentials`
 * grant, and only while the grant policy holds the grant or API key it names. Tokens and keys never carry system
 * admin: that stays with a session and its IP allow-list.
 */
export async function setActorFromToken(ctx: Context<Env>, jwt: string, scope: { tenantId: string; organizationId?: string }): Promise<void> {
  const token = await verifyAccessToken(jwt, scope);
  const grant = await resolveTokenGrant(token);
  if (grant.refusal !== null) throw unauthorized(grant.refusal);

  if (grant.kind === 'user') {
    const { user } = grant;
    const memberships = await loadMemberships(user.id);
    ctx.set('user', user);
    ctx.set('userId', user.id);
    ctx.set('memberships', memberships);
    ctx.set('actor', { kind: 'user', id: user.id, bindings: memberships, scopes: token.scopes });
  } else {
    const { account } = grant;
    ctx.set('actor', {
      kind: 'service',
      id: account.id,
      tenantId: account.tenantId,
      bindings: account.bindings,
      scopes: token.scopes,
    });
  }
  ctx.set('isSystemAdmin', false);
  ctx.set('db', baseDb);
}

/**
 * The grant policy's verdict on the grant (per tenant) or API key a token names, cached with the actor's row. A key
 * expires by the clock alone, unannounced, so its rule runs at every use, on a cached key as on a fresh one.
 */
async function resolveTokenGrant(token: VerifiedAccessToken): Promise<TokenGrantEntry> {
  const entry = getTokenGrantCache(token) ?? (await loadTokenGrant(token));
  if (entry.refusal !== null || entry.kind === 'user') return entry;
  const refusal = apiKeyRefusal(entry.apiKey, entry.account);
  return refusal ? { refusal } : entry;
}

/** What the database holds on the token's grant or key, cached for the token's next use. */
async function loadTokenGrant(token: VerifiedAccessToken): Promise<TokenGrantEntry> {
  let entry: TokenGrantEntry;
  if (token.kind === 'user') {
    // A revoked grant, or one a replayed code or refresh token revoked, is deleted: its tokens stop with it.
    const grant = await findConsentOfUser({ var: { db: baseDb } }, { grantId: token.grantId, userId: token.actorId });
    const refusal = grant ? await grantRefusal({ userId: token.actorId, clientId: token.clientId, tenantId: token.tenantId }) : 'grant_revoked';
    const [user] = refusal ? [] : await baseDb.select().from(usersTable).where(eq(usersTable.id, token.actorId));
    entry = user ? { refusal: null, kind: 'user', user } : { refusal: refusal ?? 'unknown_user' };
  } else {
    // The key the token was minted with, which must belong to the token's account.
    const found = await findApiKeyWithAccount({ var: { db: baseDb } }, { key: { id: token.keyId }, actorId: token.actorId });
    entry = found ? { refusal: null, kind: 'service', ...found } : { refusal: 'invalid_api_key' };
  }
  setTokenGrantCache(token, entry);
  return entry;
}

/** The key and its account in one read, cached by hash; a revoke, roll, or disable invalidates the account's keys. */
async function resolveApiKey(hash: string) {
  const cached = getApiKeyCache(hash);
  if (cached) return cached;
  const found = await findApiKeyWithAccount({ var: { db: baseDb } }, { key: { hash } });
  if (found) setApiKeyCache(hash, found);
  return found;
}

/**
 * Authenticates a machine caller by API key or access token and sets the actor: a secret API key runs as its service account; a token from
 * the app's own authorization server runs as the consenting user or the account behind it. Tenant resolution stays
 * with `tenantGuard`, which checks the URL against the actor's tenant. Sessions never reach this guard; browsers never
 * pass it.
 */
export const serviceGuard = xMiddleware(
  {
    functionName: 'serviceGuard',
    type: 'x-guard',
    security: [{ apiKey: [] }, { oauth2: [] }],
    name: 'service',
    description: 'Requires a secret API key or an access token and sets the service account or the consenting user as the actor',
  },
  async (ctx, next) => {
    const target = routeTarget(ctx);
    const jwt = bearerJwtFrom(ctx);
    if (jwt) {
      await setActorFromToken(ctx, jwt, target);
      return serviceBurstLimiter(ctx, next);
    }

    const raw = apiKeyFrom(ctx);
    if (!raw) {
      // RFC 9728: the challenge names where the API face publishes its metadata.
      const metadata = resourceMetadataUrl({ face: 'api', tenantId: target.tenantId });
      ctx.header('WWW-Authenticate', `Bearer resource_metadata="${metadata}"`);
      throw unauthorized('missing_api_key');
    }

    // Secret keys are for servers: a request from a browser page carries an Origin and is refused outright.
    if (ctx.req.header('origin')) throw new AppError(403, 'forbidden', 'warn', { meta: { reason: 'browser_origin' } });

    const parsed = parseApiKey(raw);
    if (parsed?.type !== 'secret') throw unauthorized('invalid_api_key');

    const resolved = await resolveApiKey(parsed.hash);
    if (!resolved) throw unauthorized('invalid_api_key');
    const refusal = apiKeyRefusal(resolved.apiKey, resolved.account);
    if (refusal) throw unauthorized(refusal);
    const { apiKey, account } = resolved;

    ctx.set('actor', {
      kind: 'service',
      id: account.id,
      tenantId: account.tenantId,
      bindings: account.bindings,
      scopes: apiKey.scopes,
    });
    ctx.set('isSystemAdmin', false);
    ctx.set('db', baseDb);

    return serviceBurstLimiter(ctx, next);
  },
);
