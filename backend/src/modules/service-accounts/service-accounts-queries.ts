import { and, count, desc, eq, gt, ilike, isNull, or, type SQL, sql } from 'drizzle-orm';
import type { DbContext } from '#/core/context';
import { type ListTotalSource, resolveListTotal } from '#/db/utils/list-total';
import { apiKeySafeColumns, apiKeysTable } from '#/modules/service-accounts/api-keys-db';
import { serviceAccountsTable } from '#/modules/service-accounts/service-accounts-db';
import { prepareStringForILikeFilter } from '#/utils/sql';

interface InTenantOpts {
  tenantId: string;
}

/** The account by id inside a tenant, or undefined. */
export async function findServiceAccountInTenant(ctx: DbContext, { id, tenantId }: InTenantOpts & { id: string }) {
  const [account] = await ctx.var.db
    .select()
    .from(serviceAccountsTable)
    .where(and(eq(serviceAccountsTable.id, id), eq(serviceAccountsTable.tenantId, tenantId)))
    .limit(1);
  return account;
}

interface ListServiceAccountsOpts extends InTenantOpts {
  q?: string;
  offset: number;
  limit: number;
}

/** A tenant holds one organization, so tenant scope is organization scope. */
export async function listServiceAccounts(ctx: DbContext, { tenantId, q, offset, limit }: ListServiceAccountsOpts) {
  const where: SQL[] = [eq(serviceAccountsTable.tenantId, tenantId)];
  if (q) where.push(ilike(serviceAccountsTable.name, prepareStringForILikeFilter(q)));

  const itemsQuery = ctx.var.db
    .select()
    .from(serviceAccountsTable)
    .where(and(...where))
    .orderBy(desc(serviceAccountsTable.createdAt))
    .limit(limit)
    .offset(offset);
  const totalSource: ListTotalSource = {
    kind: 'exact',
    getTotal: async () => {
      const [{ total }] = await ctx.var.db
        .select({ total: count() })
        .from(serviceAccountsTable)
        .where(and(...where));
      return total;
    },
  };
  return resolveListTotal(itemsQuery, totalSource);
}

/** Accounts are disabled, never deleted (D18); only active ones count against the quota. */
export async function countServiceAccounts(ctx: DbContext, { tenantId }: InTenantOpts): Promise<number> {
  const [{ value }] = await ctx.var.db
    .select({ value: count() })
    .from(serviceAccountsTable)
    .where(and(eq(serviceAccountsTable.tenantId, tenantId), eq(serviceAccountsTable.status, 'active')));
  return value;
}

/** Revoked and expired keys do not count against the quota; they stay only as the audit trail. */
export async function countLiveApiKeys(ctx: DbContext, { tenantId }: InTenantOpts): Promise<number> {
  const [{ value }] = await ctx.var.db
    .select({ value: count() })
    .from(apiKeysTable)
    .where(
      and(
        eq(apiKeysTable.tenantId, tenantId),
        isNull(apiKeysTable.revokedAt),
        or(isNull(apiKeysTable.expiresAt), gt(apiKeysTable.expiresAt, sql`now()`)),
      ),
    );
  return value;
}

export async function findApiKeysByPrincipal(ctx: DbContext, { principalId }: { principalId: string }) {
  return ctx.var.db
    .select(apiKeySafeColumns)
    .from(apiKeysTable)
    .where(eq(apiKeysTable.principalId, principalId))
    .orderBy(desc(apiKeysTable.createdAt));
}

interface ScheduleApiKeyExpiryOpts {
  principalId: string;
  id: string;
  expiresAt: string;
}

/** Sets `expiresAt` on a live key of the principal for the roll overlap, never later than an expiry it already has; null when no such key exists. */
export async function scheduleApiKeyExpiry(ctx: DbContext, { principalId, id, expiresAt }: ScheduleApiKeyExpiryOpts) {
  const [row] = await ctx.var.db
    .update(apiKeysTable)
    .set({ expiresAt: sql`LEAST(${apiKeysTable.expiresAt}, ${expiresAt}::timestamp)` })
    .where(and(eq(apiKeysTable.id, id), eq(apiKeysTable.principalId, principalId), isNull(apiKeysTable.revokedAt)))
    .returning({ id: apiKeysTable.id });
  return row ?? null;
}

interface RevokeApiKeyOpts {
  principalId: string;
  id: string;
  revokedAt: string;
  revokedBy: string;
}

/** Revokes a live key; a second call finds nothing, so the first `revokedAt` stays as the audit timestamp. */
export async function revokeApiKey(ctx: DbContext, { principalId, id, revokedAt, revokedBy }: RevokeApiKeyOpts) {
  const [row] = await ctx.var.db
    .update(apiKeysTable)
    .set({ revokedAt, revokedBy })
    .where(and(eq(apiKeysTable.id, id), eq(apiKeysTable.principalId, principalId), isNull(apiKeysTable.revokedAt)))
    .returning(apiKeySafeColumns);
  return row ?? null;
}
