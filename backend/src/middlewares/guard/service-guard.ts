import { eq } from 'drizzle-orm';
import type { Context } from 'hono';
import type { Env } from '#/core/context';
import { AppError } from '#/core/error';
import { xMiddleware } from '#/core/x-middleware';
import { baseDb } from '#/db/db';
import { findTenantById } from '#/db/prepared';
import { serviceBurstLimiter } from '#/middlewares/rate-limiter/limiters';
import type { MembershipBaseModel } from '#/modules/memberships/helpers/select';
import { credentialsTable } from '#/modules/service-accounts/credentials-db';
import { looksLikeApiKey, parseApiKey } from '#/modules/service-accounts/helpers/api-key';
import { type ServiceGrant, serviceAccountsTable } from '#/modules/service-accounts/service-accounts-db';
import { normalizeRestrictions } from '#/modules/tenants/tenant-restrictions';
import { isExpiredDate } from '#/utils/is-expired-date';
import { getIsoDate } from '#/utils/iso-date';
import { log } from '#/utils/logger';
import { getTenantCache, setTenantCache } from './tenant-cache';

/** The raw credential from `Authorization: Bearer` or `x-api-key`, when the request carries one of this app's keys. */
export function serviceCredentialFrom(ctx: Context<Env>): string | null {
  const bearer = ctx.req.header('authorization');
  const fromBearer = bearer?.toLowerCase().startsWith('bearer ') ? bearer.slice(7).trim() : null;
  const value = fromBearer ?? ctx.req.header('x-api-key')?.trim() ?? null;
  return value && looksLikeApiKey(value) ? value : null;
}

export const hasServiceCredential = (ctx: Context<Env>): boolean => serviceCredentialFrom(ctx) !== null;

/** `lastUsedAt` is written at most once per key per window; the value is advisory. */
const LAST_USED_DEBOUNCE_MS = 5 * 60 * 1000;
const lastUsedWrites = new Map<string, number>();

function touchLastUsed(credentialId: string, serviceAccountId: string): void {
  const now = Date.now();
  const previous = lastUsedWrites.get(credentialId) ?? 0;
  if (now - previous < LAST_USED_DEBOUNCE_MS) return;
  lastUsedWrites.set(credentialId, now);
  const at = getIsoDate();
  void Promise.all([
    baseDb.update(credentialsTable).set({ lastUsedAt: at }).where(eq(credentialsTable.id, credentialId)),
    baseDb.update(serviceAccountsTable).set({ lastUsedAt: at }).where(eq(serviceAccountsTable.id, serviceAccountId)),
  ]).catch((err) => log.warn('Failed to stamp credential lastUsedAt', { err, credentialId }));
}

/** A service grant widened to the membership shape every consumer of `actor.grants` reads today. */
const toGrantRow = (grant: ServiceGrant, serviceAccountId: string, tenantId: string): MembershipBaseModel => ({
  id: serviceAccountId,
  tenantId,
  channelType: grant.channelType,
  channelId: grant.channelId,
  organizationId: grant.organizationId,
  userId: serviceAccountId,
  role: grant.role,
  archived: false,
  muted: false,
  displayOrder: 0,
});

/**
 * Authenticates a secret API key and sets the service account as the actor. The tenant comes from the key, never
 * from the URL (tenantGuard checks they agree). Sessions never reach this guard; browsers never pass it.
 */
export const serviceGuard = xMiddleware(
  {
    functionName: 'serviceGuard',
    type: 'x-guard',
    name: 'service',
    description: 'Requires a secret API key and sets the service account as the actor',
  },
  async (ctx, next) => {
    const raw = serviceCredentialFrom(ctx);
    if (!raw) throw new AppError(401, 'unauthorized', 'warn', { meta: { reason: 'missing_api_key' } });

    // Secret keys are for servers: a request from a browser page carries an Origin and is refused outright.
    if (ctx.req.header('origin')) throw new AppError(403, 'forbidden', 'warn', { meta: { reason: 'browser_origin' } });

    const parsed = parseApiKey(raw);
    if (parsed?.kind !== 'sk') throw new AppError(401, 'unauthorized', 'warn', { meta: { reason: 'invalid_api_key' } });

    const [credential] = await baseDb
      .select()
      .from(credentialsTable)
      .where(eq(credentialsTable.hash, parsed.hash))
      .limit(1);
    if (!credential || credential.revokedAt || (credential.expiresAt && isExpiredDate(credential.expiresAt))) {
      throw new AppError(401, 'unauthorized', 'warn', { meta: { reason: 'invalid_api_key' } });
    }

    const [account] = await baseDb
      .select()
      .from(serviceAccountsTable)
      .where(eq(serviceAccountsTable.id, credential.principalId))
      .limit(1);
    if (account?.status !== 'active') {
      throw new AppError(401, 'unauthorized', 'warn', { meta: { reason: 'service_account_disabled' } });
    }

    const tenantId = account.tenantId;
    let tenant = getTenantCache(tenantId);
    if (!tenant) {
      const [row] = await findTenantById.execute({ id: tenantId });
      if (!row) throw new AppError(404, 'not_found', 'warn', { meta: { resource: 'tenant' } });
      row.restrictions = normalizeRestrictions(row.restrictions);
      setTenantCache(tenantId, row);
      tenant = row;
    }
    if (tenant.status !== 'active')
      throw new AppError(403, 'forbidden', 'warn', { message: `Tenant is ${tenant.status}` });

    ctx.set('actor', {
      kind: 'service',
      id: account.id,
      grants: account.grants.map((grant) => toGrantRow(grant, account.id, tenantId)),
      scopes: credential.scopes,
      credential: { kind: 'secret', id: credential.id },
    });
    ctx.set('isSystemAdmin', false);
    ctx.set('db', baseDb);
    ctx.set('tenantId', tenantId);
    ctx.set('tenant', tenant);

    touchLastUsed(credential.id, account.id);

    return serviceBurstLimiter(ctx, next);
  },
);
