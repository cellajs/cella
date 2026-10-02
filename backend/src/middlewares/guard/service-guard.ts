import { eq } from 'drizzle-orm';
import type { Context } from 'hono';
import type { Env } from '#/core/context';
import { AppError } from '#/core/error';
import { xMiddleware } from '#/core/x-middleware';
import { baseDb } from '#/db/db';
import { getApiKeyCache, setApiKeyCache } from '#/middlewares/guard/api-key-cache';
import { loadMemberships } from '#/middlewares/guard/membership-cache';
import { getTokenGrantCache, setTokenGrantCache, type TokenGrantEntry } from '#/middlewares/guard/token-grant-cache';
import { serviceBurstLimiter } from '#/middlewares/rate-limiter/limiters';
import { grantRefusal } from '#/modules/oauth-server/grant-policy';
import { findLiveGrantBindings } from '#/modules/oauth-server/oauth-server-queries';
import { resourceMetadataUrl } from '#/modules/oauth-server/resources';
import { bearerJwtFrom, type VerifiedAccessToken, verifyAccessToken } from '#/modules/oauth-server/verify-access-token';
import { apiKeyFrom, apiKeyRefusal, parseApiKey } from '#/modules/service-accounts/helpers/api-key';
import { findApiKeyWithAccount } from '#/modules/service-accounts/service-accounts-queries';
import { type UserModel, usersTable } from '#/modules/user/user-db';

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

  if (token.kind === 'user') {
    const { user, bindingsVersion } = await resolveUserToken(token);
    const memberships = await loadMemberships(user.id, bindingsVersion);
    ctx.set('user', user);
    ctx.set('userId', user.id);
    ctx.set('memberships', memberships);
    ctx.set('actor', { kind: 'user', id: user.id, bindings: memberships, scopes: token.scopes });
  } else {
    const account = await resolveServiceToken(token);
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

type UserToken = Extract<VerifiedAccessToken, { kind: 'user' }>;

/**
 * A person's token: the grant it names and the user's bindings version are read at every use, so a revoked grant
 * stops the token and a membership change narrows it at the next request in every process. The grant policy's verdict
 * with the user row is cached per grant, tenant and bindings version (`token-grant-cache.ts`).
 */
async function resolveUserToken(token: UserToken): Promise<{ user: UserModel; bindingsVersion: string }> {
  const live = await findLiveGrantBindings({ var: { db: baseDb } }, { grantId: token.grantId, userId: token.actorId });
  if (!live) throw unauthorized('grant_revoked');

  const { bindingsVersion } = live;
  const entry = getTokenGrantCache(token, bindingsVersion) ?? (await loadTokenGrant(token, bindingsVersion));
  if (entry.refusal !== null) throw unauthorized(entry.refusal);
  return { user: entry.user, bindingsVersion };
}

/** The grant policy's verdict on a live grant, with the user row, cached for the token's next uses. */
async function loadTokenGrant(token: UserToken, bindingsVersion: string): Promise<TokenGrantEntry> {
  const refusal = await grantRefusal({ userId: token.actorId, clientId: token.clientId, tenantId: token.tenantId });
  const [user] = refusal ? [] : await baseDb.select().from(usersTable).where(eq(usersTable.id, token.actorId));
  const entry: TokenGrantEntry = user ? { refusal: null, user } : { refusal: refusal ?? 'unknown_user' };
  setTokenGrantCache(token, bindingsVersion, entry);
  return entry;
}

/**
 * A service account's token: the key it was minted with and its account, read in one statement at every use, so a
 * revoked or expired key or a disabled account stops it at the next request in every process.
 */
async function resolveServiceToken(token: Extract<VerifiedAccessToken, { kind: 'service' }>) {
  const found = await findApiKeyWithAccount({ var: { db: baseDb } }, { key: { id: token.keyId }, actorId: token.actorId });
  if (!found) throw unauthorized('invalid_api_key');
  const refusal = apiKeyRefusal(found.apiKey, found.account);
  if (refusal) throw unauthorized(refusal);
  return found.account;
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
    description: 'Requires a secret API key or an access token; acts as its service account or consenting user, limited to its scopes',
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
