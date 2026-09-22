import { eq } from 'drizzle-orm';
import { AppError } from '#/core/error';
import { xMiddleware } from '#/core/x-middleware';
import { baseDb } from '#/db/db';
import type { ServiceAccountId } from '#/db/utils/ids';
import { serviceBurstLimiter } from '#/middlewares/rate-limiter/limiters';
import { credentialsTable } from '#/modules/service-accounts/credentials-db';
import { apiKeyFrom, parseApiKey } from '#/modules/service-accounts/helpers/api-key';
import { serviceAccountsTable } from '#/modules/service-accounts/service-accounts-db';
import { isExpiredDate } from '#/utils/is-expired-date';
import { getIsoDate } from '#/utils/iso-date';
import { log } from '#/utils/logger';

/** `lastUsedAt` is written at most once per key per window; the value is advisory. */
const LAST_USED_DEBOUNCE_MS = 5 * 60 * 1000;
const lastUsedWrites = new Map<string, number>();

function touchLastUsed(credentialId: string, serviceAccountId: string): void {
  const now = Date.now();
  if (now - (lastUsedWrites.get(credentialId) ?? 0) < LAST_USED_DEBOUNCE_MS) return;
  lastUsedWrites.set(credentialId, now);
  const at = getIsoDate();
  void Promise.all([
    baseDb.update(credentialsTable).set({ lastUsedAt: at }).where(eq(credentialsTable.id, credentialId)),
    baseDb.update(serviceAccountsTable).set({ lastUsedAt: at }).where(eq(serviceAccountsTable.id, serviceAccountId)),
  ]).catch((err) => log.warn('Failed to stamp credential lastUsedAt', { err, credentialId }));
}

const invalidKey = (reason: string) => new AppError(401, 'unauthorized', 'warn', { meta: { reason } });

/**
 * Authenticates a secret API key and sets its service account as the actor. Tenant resolution stays with
 * `tenantGuard`, which checks the URL against the actor's tenant. Sessions never reach this guard; browsers never pass it.
 */
export const serviceGuard = xMiddleware(
  {
    functionName: 'serviceGuard',
    type: 'x-guard',
    name: 'service',
    description: 'Requires a secret API key and sets the service account as the actor',
  },
  async (ctx, next) => {
    const raw = apiKeyFrom(ctx);
    if (!raw) throw invalidKey('missing_api_key');

    // Secret keys are for servers: a request from a browser page carries an Origin and is refused outright.
    if (ctx.req.header('origin')) throw new AppError(403, 'forbidden', 'warn', { meta: { reason: 'browser_origin' } });

    const parsed = parseApiKey(raw);
    if (parsed?.type !== 'secret') throw invalidKey('invalid_api_key');

    const [credential] = await baseDb
      .select()
      .from(credentialsTable)
      .where(eq(credentialsTable.hash, parsed.hash))
      .limit(1);
    if (!credential || credential.revokedAt || (credential.expiresAt && isExpiredDate(credential.expiresAt))) {
      throw invalidKey('invalid_api_key');
    }

    const [account] = await baseDb
      .select()
      .from(serviceAccountsTable)
      // A credential's principal is a service account in this phase; a user-owned key (PAT) would branch here.
      .where(eq(serviceAccountsTable.id, credential.principalId as ServiceAccountId))
      .limit(1);
    if (account?.status !== 'active') throw invalidKey('service_account_disabled');

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
