import { and, eq } from 'drizzle-orm';
import type { Context } from 'hono';
import type { Env } from '#/core/context';
import { AppError } from '#/core/error';
import { xMiddleware } from '#/core/x-middleware';
import { baseDb } from '#/db/db';
import { TTLCache } from '#/lib/ttl-cache';
import { getMembershipCache, setMembershipCache } from '#/middlewares/guard/auth-cache';
import { getCredentialCache, setCredentialCache, shouldStampLastUsed } from '#/middlewares/guard/credential-cache';
import { serviceBurstLimiter } from '#/middlewares/rate-limiter/limiters';
import { membershipsTable } from '#/modules/memberships/memberships-db';
import { resourceMetadataUrl } from '#/modules/oauth-server/resources';
import { bearerJwtFrom, verifyAccessToken } from '#/modules/oauth-server/verify-access-token';
import { credentialsTable } from '#/modules/service-accounts/credentials-db';
import { apiKeyFrom, parseApiKey } from '#/modules/service-accounts/helpers/api-key';
import { serviceAccountsTable } from '#/modules/service-accounts/service-accounts-db';
import { type UserModel, usersTable } from '#/modules/user/user-db';
import { isExpiredDate } from '#/utils/is-expired-date';
import { getIsoDate } from '#/utils/iso-date';
import { log } from '#/utils/logger';

/** Users behind access tokens have no session to cache under; the row is cached by id for the token's lifetime scale. */
const tokenUserCache = new TTLCache<UserModel>({ maxSize: 5000, defaultTtl: 60_000 });

function touchLastUsed(credentialId: string, serviceAccountId: string): void {
  if (!shouldStampLastUsed(credentialId)) return;
  const at = getIsoDate();
  void Promise.all([
    baseDb.update(credentialsTable).set({ lastUsedAt: at }).where(eq(credentialsTable.id, credentialId)),
    baseDb.update(serviceAccountsTable).set({ lastUsedAt: at }).where(eq(serviceAccountsTable.id, serviceAccountId)),
  ]).catch((err) => log.warn('Failed to stamp credential lastUsedAt', { err, credentialId }));
}

export const unauthorized = (reason: string) => new AppError(401, 'unauthorized', 'warn', { meta: { reason } });

/** The route's tenant and organization ids as the URL carries them; every machine guard binds a credential to them. */
export function routeScope(ctx: Context<Env>): { tenantId: string; organizationId?: string } {
  const tenantId = ctx.req.param('tenantId')?.toLowerCase();
  if (!tenantId)
    throw new AppError(400, 'invalid_request', 'error', { meta: { reason: 'Missing tenantId parameter' } });
  return { tenantId, organizationId: ctx.req.param('organizationId') };
}

/**
 * A token from the app's own authorization server (D12): verified locally, bound to this route's tenant, it runs as
 * the user who consented (masked by the token's scopes) or as the service account behind a `client_credentials`
 * grant. Tokens and keys never carry system admin: that stays with a session and its IP allow-list.
 */
export async function setActorFromToken(
  ctx: Context<Env>,
  jwt: string,
  scope: { tenantId: string; organizationId?: string },
): Promise<void> {
  const token = await verifyAccessToken(jwt, scope);

  if (token.kind === 'user') {
    let user = tokenUserCache.get(token.principalId);
    if (!user) {
      [user] = await baseDb.select().from(usersTable).where(eq(usersTable.id, token.principalId)).limit(1);
      if (!user) throw unauthorized('unknown_user');
      tokenUserCache.set(user.id, user);
    }
    let memberships = getMembershipCache(user.id);
    if (!memberships) {
      memberships = await baseDb.select().from(membershipsTable).where(eq(membershipsTable.userId, user.id));
      setMembershipCache(user.id, memberships);
    }
    ctx.set('user', user);
    ctx.set('userId', user.id);
    ctx.set('memberships', memberships);
    ctx.set('actor', { kind: 'user', id: user.id, grants: memberships, scopes: token.scopes });
  } else {
    const [account] = await baseDb
      .select()
      .from(serviceAccountsTable)
      .where(eq(serviceAccountsTable.id, token.principalId))
      .limit(1);
    if (account?.status !== 'active') throw unauthorized('service_account_disabled');
    ctx.set('actor', {
      kind: 'service',
      id: account.id,
      tenantId: account.tenantId,
      grants: account.grants,
      scopes: token.scopes,
    });
  }
  ctx.set('isSystemAdmin', false);
  ctx.set('db', baseDb);
}

/** The key and its account in one read, cached by hash; a revoke, roll, or disable invalidates the account's keys. */
async function resolveCredential(hash: string) {
  const cached = getCredentialCache(hash);
  if (cached) return cached;
  const [row] = await baseDb
    .select({ credential: credentialsTable, account: serviceAccountsTable })
    .from(credentialsTable)
    .innerJoin(serviceAccountsTable, eq(serviceAccountsTable.id, credentialsTable.principalId))
    .where(and(eq(credentialsTable.hash, hash)))
    .limit(1);
  if (row) setCredentialCache(hash, row);
  return row;
}

/**
 * Authenticates a machine credential and sets the actor: a secret API key runs as its service account; a token from
 * the app's own authorization server runs as the consenting user or the account behind it. Tenant resolution stays
 * with `tenantGuard`, which checks the URL against the actor's tenant. Sessions never reach this guard; browsers never
 * pass it.
 */
export const serviceGuard = xMiddleware(
  {
    functionName: 'serviceGuard',
    type: 'x-guard',
    name: 'service',
    description:
      'Requires a secret API key or an access token and sets the service account or the consenting user as the actor',
  },
  async (ctx, next) => {
    const scope = routeScope(ctx);
    const jwt = bearerJwtFrom(ctx);
    if (jwt) {
      await setActorFromToken(ctx, jwt, scope);
      return serviceBurstLimiter(ctx, next);
    }

    const raw = apiKeyFrom(ctx);
    if (!raw) {
      // RFC 9728: the challenge names where the API face publishes its metadata.
      ctx.header(
        'WWW-Authenticate',
        `Bearer resource_metadata="${resourceMetadataUrl({ face: 'api', tenantId: scope.tenantId })}"`,
      );
      throw unauthorized('missing_api_key');
    }

    // Secret keys are for servers: a request from a browser page carries an Origin and is refused outright.
    if (ctx.req.header('origin')) throw new AppError(403, 'forbidden', 'warn', { meta: { reason: 'browser_origin' } });

    const parsed = parseApiKey(raw);
    if (parsed?.type !== 'secret') throw unauthorized('invalid_api_key');

    const resolved = await resolveCredential(parsed.hash);
    const credential = resolved?.credential;
    if (!credential || credential.revokedAt || (credential.expiresAt && isExpiredDate(credential.expiresAt))) {
      throw unauthorized('invalid_api_key');
    }
    if (resolved.account.status !== 'active') throw unauthorized('service_account_disabled');
    const { account } = resolved;

    ctx.set('actor', {
      kind: 'service',
      id: account.id,
      tenantId: account.tenantId,
      grants: account.grants,
      scopes: credential.scopes,
    });
    ctx.set('isSystemAdmin', false);
    ctx.set('db', baseDb);

    touchLastUsed(credential.id, account.id);

    return serviceBurstLimiter(ctx, next);
  },
);
