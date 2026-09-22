import { and, count, desc, eq, gt, ilike, isNull, or, type SQL, sql } from 'drizzle-orm';
import type { DbContext } from '#/core/context';
import { type ListTotalSource, resolveListTotal } from '#/db/utils/list-total';
import { credentialSafeColumns, credentialsTable } from '#/modules/service-accounts/credentials-db';
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
export async function countLiveCredentials(ctx: DbContext, { tenantId }: InTenantOpts): Promise<number> {
  const [{ value }] = await ctx.var.db
    .select({ value: count() })
    .from(credentialsTable)
    .where(
      and(
        eq(credentialsTable.tenantId, tenantId),
        isNull(credentialsTable.revokedAt),
        or(isNull(credentialsTable.expiresAt), gt(credentialsTable.expiresAt, sql`now()`)),
      ),
    );
  return value;
}

export async function findCredentialsByPrincipal(ctx: DbContext, { principalId }: { principalId: string }) {
  return ctx.var.db
    .select(credentialSafeColumns)
    .from(credentialsTable)
    .where(eq(credentialsTable.principalId, principalId))
    .orderBy(desc(credentialsTable.createdAt));
}

interface ExpireCredentialOpts {
  principalId: string;
  id: string;
  expiresAt: string;
}

/** Sets `expiresAt` on a live key of the principal for the roll overlap, never later than an expiry it already has; null when no such key exists. */
export async function expireCredential(ctx: DbContext, { principalId, id, expiresAt }: ExpireCredentialOpts) {
  const [row] = await ctx.var.db
    .update(credentialsTable)
    .set({ expiresAt: sql`LEAST(${credentialsTable.expiresAt}, ${expiresAt}::timestamp)` })
    .where(
      and(
        eq(credentialsTable.id, id),
        eq(credentialsTable.principalId, principalId),
        isNull(credentialsTable.revokedAt),
      ),
    )
    .returning({ id: credentialsTable.id });
  return row ?? null;
}

interface RevokeCredentialOpts {
  principalId: string;
  id: string;
  revokedAt: string;
  revokedBy: string;
}

/** Revokes a live key; a second call finds nothing, so the first `revokedAt` stays as the audit timestamp. */
export async function revokeCredential(
  ctx: DbContext,
  { principalId, id, revokedAt, revokedBy }: RevokeCredentialOpts,
) {
  const [row] = await ctx.var.db
    .update(credentialsTable)
    .set({ revokedAt, revokedBy })
    .where(
      and(
        eq(credentialsTable.id, id),
        eq(credentialsTable.principalId, principalId),
        isNull(credentialsTable.revokedAt),
      ),
    )
    .returning(credentialSafeColumns);
  return row ?? null;
}
