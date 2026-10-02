import { and, count, desc, eq, gt, ilike, isNull, or, type SQL, sql } from 'drizzle-orm';
import { generateId } from 'shared/utils/entity-id';
import type { DbContext } from '#/core/context';
import { type ListTotalSource, resolveListTotal } from '#/db/utils/list-total';
import { insertActors } from '#/modules/actors/actors-queries';
import { type ApiKeyModel, apiKeySafeColumns, apiKeysTable, type InsertApiKeyModel } from '#/modules/service-accounts/api-keys-db';
import { type InsertServiceAccountModel, type ServiceAccountModel, serviceAccountsTable } from '#/modules/service-accounts/service-accounts-db';
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

interface InsertServiceAccountOpts {
  values: InsertServiceAccountModel;
}

/** The only way to insert a service account: its `actors` row of kind `service` goes first, in one transaction. */
export async function insertServiceAccount(ctx: DbContext, { values }: InsertServiceAccountOpts): Promise<ServiceAccountModel> {
  const id = values.id ?? generateId();
  return ctx.var.db.transaction(async (tx) => {
    await insertActors({ var: { db: tx } }, { ids: [id], kind: 'service' });
    const [account] = await tx
      .insert(serviceAccountsTable)
      .values({ ...values, id })
      .returning();
    return account;
  });
}

interface UpdateServiceAccountOpts extends InTenantOpts {
  id: string;
  values: Partial<Pick<InsertServiceAccountModel, 'name' | 'status' | 'updatedAt' | 'updatedBy'>>;
}

/** The updated account, or undefined when no such account exists in the tenant. */
export async function updateServiceAccount(ctx: DbContext, { id, tenantId, values }: UpdateServiceAccountOpts) {
  const [account] = await ctx.var.db
    .update(serviceAccountsTable)
    .set(values)
    .where(and(eq(serviceAccountsTable.id, id), eq(serviceAccountsTable.tenantId, tenantId)))
    .returning();
  return account;
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

interface FindApiKeyWithAccountOpts {
  /** A presented key by its hash, or the key an access token names by its id. */
  key: { hash: string } | { id: string };
  /** The account the key must belong to; any account when omitted. */
  actorId?: string;
}

/**
 * A key with its service account, in one read, for `apiKeyRefusal`. The row includes the hash: for the machine guard
 * and the token endpoint only.
 * @returns The key and its account, or undefined when no such key exists.
 */
export async function findApiKeyWithAccount(ctx: DbContext, { key, actorId }: FindApiKeyWithAccountOpts) {
  const [row] = await ctx.var.db
    .select({ apiKey: apiKeysTable, account: serviceAccountsTable })
    .from(apiKeysTable)
    .innerJoin(serviceAccountsTable, eq(serviceAccountsTable.id, apiKeysTable.actorId))
    .where(
      and(
        'hash' in key ? eq(apiKeysTable.hash, key.hash) : eq(apiKeysTable.id, key.id),
        actorId === undefined ? undefined : eq(apiKeysTable.actorId, actorId),
      ),
    )
    .limit(1);
  return row;
}

interface FindApiKeysByActorOpts {
  actorId: string;
}

export async function findApiKeysByActor(ctx: DbContext, { actorId }: FindApiKeysByActorOpts) {
  return ctx.var.db.select(apiKeySafeColumns).from(apiKeysTable).where(eq(apiKeysTable.actorId, actorId)).orderBy(desc(apiKeysTable.createdAt));
}

interface InsertApiKeyOpts {
  /** Prefix, last four and hash of a generated key (`generateApiKey`); the plaintext is never stored. */
  values: InsertApiKeyModel;
}

export async function insertApiKey(ctx: DbContext, { values }: InsertApiKeyOpts): Promise<ApiKeyModel> {
  const [apiKey] = await ctx.var.db.insert(apiKeysTable).values(values).returning(apiKeySafeColumns);
  return apiKey;
}

interface ScheduleApiKeyExpiryOpts {
  actorId: string;
  id: string;
  expiresAt: string;
}

/** Sets `expiresAt` on a live key of the actor for the roll overlap, never later than an expiry it already has; null when no such key exists. */
export async function scheduleApiKeyExpiry(ctx: DbContext, { actorId, id, expiresAt }: ScheduleApiKeyExpiryOpts) {
  const [row] = await ctx.var.db
    .update(apiKeysTable)
    .set({ expiresAt: sql`LEAST(${apiKeysTable.expiresAt}, ${expiresAt}::timestamptz)` })
    .where(and(eq(apiKeysTable.id, id), eq(apiKeysTable.actorId, actorId), isNull(apiKeysTable.revokedAt)))
    .returning({ id: apiKeysTable.id });
  return row ?? null;
}

interface RevokeApiKeyOpts {
  actorId: string;
  id: string;
  revokedAt: string;
  revokedBy: string;
}

/** Revokes a live key; a second call finds nothing, so the first `revokedAt` stays as the audit timestamp. */
export async function revokeApiKey(ctx: DbContext, { actorId, id, revokedAt, revokedBy }: RevokeApiKeyOpts) {
  const [row] = await ctx.var.db
    .update(apiKeysTable)
    .set({ revokedAt, revokedBy })
    .where(and(eq(apiKeysTable.id, id), eq(apiKeysTable.actorId, actorId), isNull(apiKeysTable.revokedAt)))
    .returning(apiKeySafeColumns);
  return row ?? null;
}
