import { and, count, desc, eq, ilike, isNull, sql } from 'drizzle-orm';
import type { UserContext } from '#/core/context';
import { AppError } from '#/core/error';
import type { DbOrTx } from '#/db/db';
import { credentialSafeColumns, credentialsTable } from '#/modules/service-accounts/credentials-db';
import { serviceAccountsTable } from '#/modules/service-accounts/service-accounts-db';
import { getValidChannel } from '#/permissions';

/** Every service-account route is an organization admin's act (D9): the caller must be allowed to update the org. */
export async function requireOrgAdmin(ctx: UserContext) {
  return getValidChannel(ctx, ctx.var.organizationId, 'organization', 'update');
}

/** The account by id inside the caller's tenant; 404 otherwise. */
export async function findServiceAccountInTenant(ctx: UserContext, id: string) {
  const [account] = await ctx.var.db
    .select()
    .from(serviceAccountsTable)
    .where(and(eq(serviceAccountsTable.id, id), eq(serviceAccountsTable.tenantId, ctx.var.tenantId)))
    .limit(1);
  if (!account) throw new AppError(404, 'not_found', 'warn', { meta: { resource: 'serviceAccount' } });
  return account;
}

/** A tenant holds one organization, so tenant scope is organization scope. */
export async function listServiceAccounts(
  ctx: UserContext,
  { q, offset, limit }: { q?: string; offset: number; limit: number },
) {
  const where = and(
    eq(serviceAccountsTable.tenantId, ctx.var.tenantId),
    q ? ilike(serviceAccountsTable.name, `%${q}%`) : undefined,
  );
  const [items, [{ value: total }]] = await Promise.all([
    ctx.var.db
      .select()
      .from(serviceAccountsTable)
      .where(where)
      .orderBy(desc(serviceAccountsTable.createdAt))
      .limit(limit)
      .offset(offset),
    ctx.var.db.select({ value: count() }).from(serviceAccountsTable).where(where),
  ]);
  return { items, total };
}

export async function countServiceAccounts(ctx: UserContext): Promise<number> {
  const [{ value }] = await ctx.var.db
    .select({ value: count() })
    .from(serviceAccountsTable)
    .where(eq(serviceAccountsTable.tenantId, ctx.var.tenantId));
  return value;
}

/** Revoked keys do not count against the quota; they stay only as the audit trail. */
export async function countLiveCredentials(ctx: UserContext): Promise<number> {
  const [{ value }] = await ctx.var.db
    .select({ value: count() })
    .from(credentialsTable)
    .where(and(eq(credentialsTable.tenantId, ctx.var.tenantId), isNull(credentialsTable.revokedAt)));
  return value;
}

export async function findCredentialsByPrincipal(ctx: UserContext, principalId: string) {
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
export async function expireCredential(db: DbOrTx, { principalId, id, expiresAt }: ExpireCredentialOpts) {
  const [row] = await db
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
}

/** Revokes a live key; a second call finds nothing, so the first `revokedAt` stays as the audit timestamp. */
export async function revokeCredential(db: DbOrTx, { principalId, id, revokedAt }: RevokeCredentialOpts) {
  const [row] = await db
    .update(credentialsTable)
    .set({ revokedAt })
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
