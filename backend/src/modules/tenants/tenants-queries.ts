import type { z } from '@hono/zod-openapi';
import { and, count, eq, gt, gte, inArray, lt, notInArray, or, type SQL, sql } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import type { TenantKind } from 'shared';
import type { DbContext } from '#/core/context';
import { exactTotal, resolveListTotal } from '#/db/utils/list-total';
import { membershipsTable } from '#/modules/memberships/memberships-db';
import { organizationsTable } from '#/modules/organization/organization-db';
import { normalizeRestrictions, publicSharingTenantKinds } from '#/modules/tenants/tenant-restrictions';
import { type InsertTenantModel, type TenantModel, tenantsTable } from '#/modules/tenants/tenants-db';
import type { tenantListQuerySchema } from '#/modules/tenants/tenants-schema';
import { getIsoDate } from '#/utils/iso-date';
import { getOrderColumns } from '#/utils/order-column';
import { pick } from '#/utils/pick';
import { searchFilter } from '#/utils/sql';

/** Tenant columns a response carries. */
const tenantColumns = pick(tenantsTable, [
  'id',
  'name',
  'kind',
  'status',
  'statusChangedAt',
  'expiresAt',
  'restrictions',
  'authStrategies',
  'createdBy',
  'subscriptionId',
  'subscriptionStatus',
  'subscriptionPlan',
  'createdAt',
  'updatedAt',
  'updatedBy',
]);

const tenantOrderColumns = pick(tenantsTable, ['name', 'createdAt']);

/** Tenant rows joined with the organization each holds (organizations.tenant_id is unique). */
const selectTenants = (ctx: DbContext) =>
  ctx.var.db
    .select({
      ...tenantColumns,
      organization: pick(organizationsTable, ['id', 'name', 'slug', 'thumbnailUrl']),
    })
    .from(tenantsTable)
    .leftJoin(organizationsTable, eq(organizationsTable.tenantId, tenantsTable.id))
    .$dynamic();

type TenantRow = Awaited<ReturnType<typeof selectTenants>>[number];

/**
 * Marks the organization (null for an orphan tenant) with its entity type and gives a stored row the restriction
 * fields it predates, so one such row cannot fail a whole list.
 */
const toTenant = ({ organization, ...tenant }: TenantRow) => ({
  ...tenant,
  restrictions: normalizeRestrictions(tenant.restrictions),
  organization: organization && { ...organization, entityType: 'organization' as const },
});

/** `EXISTS` on the tenant a row's `tenantId` column names being of one of `kinds`, for a list or count of another table; no kind matches nothing. */
export const tenantOfKind = (tenantId: AnyPgColumn, kinds: TenantKind[]): SQL =>
  kinds.length === 0
    ? sql`false`
    : sql`EXISTS (SELECT 1 FROM ${tenantsTable} WHERE ${tenantsTable.id} = ${tenantId} AND ${inArray(tenantsTable.kind, kinds)})`;

interface FindTenantsPaginatedOpts extends Pick<z.infer<typeof tenantListQuerySchema>['orderBy'], 'sort' | 'order'> {
  /** Searches the name. */
  q?: string;
  status?: TenantModel['status'];
  kinds: TenantKind[];
  limit: number;
  offset: number;
}

/** A page of tenants of `kinds`, each with its organization, and the total. */
export const findTenantsPaginated = async (ctx: DbContext, { q, status, kinds, sort, order, limit, offset }: FindTenantsPaginatedOpts) => {
  const filter = and(searchFilter([tenantsTable.name], q), status ? eq(tenantsTable.status, status) : undefined, inArray(tenantsTable.kind, kinds));

  const orderBy = getOrderColumns({ sort, order, columns: tenantOrderColumns, tieBreaker: tenantsTable.id });

  const itemsQuery = selectTenants(ctx)
    .where(filter)
    .orderBy(...orderBy)
    .limit(limit)
    .offset(offset)
    .then((rows) => rows.map(toTenant));

  return resolveListTotal(itemsQuery, exactTotal(ctx.var.db.select({ total: count() }).from(tenantsTable).where(filter)));
};

interface FindTenantOpts {
  where: SQL | undefined;
  /** Locks the tenant row until the caller's transaction ends; needs a read-write transaction. */
  forUpdate?: boolean;
}

/** The first tenant matching `where`, in its response shape; undefined when none matches. */
export const findTenant = async (ctx: DbContext, { where, forUpdate = false }: FindTenantOpts) => {
  const query = selectTenants(ctx).where(where).limit(1);
  // The organization joins from the nullable side, so the lock names the tenant row alone.
  const [row] = forUpdate ? await query.for('no key update', { of: tenantsTable }) : await query;
  return row ? toTenant(row) : undefined;
};

interface TenantCreatorOpts {
  createdBy: string;
}

/** A tenant the user created that holds no organization yet, in its response shape; undefined when none does. */
export const findOrphanTenant = async (ctx: DbContext, { createdBy }: TenantCreatorOpts) => {
  const tenantsWithOrg = ctx.var.db.select({ tenantId: organizationsTable.tenantId }).from(organizationsTable);
  return findTenant(ctx, { where: and(eq(tenantsTable.createdBy, createdBy), notInArray(tenantsTable.id, tenantsWithOrg)) });
};

/**
 * The demo tenant the account is a member of, in its response shape; undefined for an account seated in none. Membership,
 * not `createdBy`: an app can seat guests in a demo on accounts of their own, and each of them gets it back.
 */
export const findDemoTenant = async (ctx: DbContext, { userId }: { userId: string }) => {
  const memberOf = ctx.var.db.select({ tenantId: membershipsTable.tenantId }).from(membershipsTable).where(eq(membershipsTable.userId, userId));
  // A demo past its end or archived is over before the sweep removes it
  const running = and(eq(tenantsTable.kind, 'demo'), eq(tenantsTable.status, 'active'), gt(tenantsTable.expiresAt, getIsoDate()));
  return findTenant(ctx, { where: and(inArray(tenantsTable.id, memberOf), running) });
};

/**
 * Admits a row to a public read by the tenant `tenantId` names, as `servesPublicly` decides for a loaded tenant: active,
 * not past its end and of a kind that shares with the public.
 * @public
 */
export const publiclyServedTenant = (tenantId: AnyPgColumn): SQL =>
  sql`EXISTS (SELECT 1 FROM ${tenantsTable} WHERE ${tenantsTable.id} = ${tenantId} AND ${tenantsTable.status} = 'active' AND (${tenantsTable.expiresAt} IS NULL OR ${tenantsTable.expiresAt} > ${getIsoDate()}) AND ${tenantsTable.kind} IN ${publicSharingTenantKinds()})`;

/** Makes demo builds wait for each other until the transaction ends, so a burst at the day's cap counts one at a time. */
export const lockDemoCreation = async (ctx: DbContext) => {
  await ctx.var.db.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended('demo_creation', 0))`);
};

/**
 * Makes the creations of one user wait for each other until the transaction ends, so a parallel burst reads the
 * orphan and the count one request at a time. Its own statement: the reads after it take their snapshot once it is granted.
 */
export const lockTenantCreation = async (ctx: DbContext, { createdBy }: TenantCreatorOpts) => {
  await ctx.var.db.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`tenant_creation:${createdBy}`}, 0))`);
};

/** How many tenants the user created, archived ones included. */
export const countTenantsCreatedBy = async (ctx: DbContext, { createdBy }: TenantCreatorOpts) => {
  const [{ total }] = await ctx.var.db.select({ total: count() }).from(tenantsTable).where(eq(tenantsTable.createdBy, createdBy));
  return total;
};

interface CountTenantsCreatedSinceOpts {
  kind: TenantKind;
  /** The ISO moment the count starts at. */
  since: string;
}

/** How many tenants of `kind` were created since `since`, removed ones aside. */
export const countTenantsCreatedSince = async (ctx: DbContext, { kind, since }: CountTenantsCreatedSinceOpts) => {
  const [{ total }] = await ctx.var.db
    .select({ total: count() })
    .from(tenantsTable)
    .where(and(eq(tenantsTable.kind, kind), gte(tenantsTable.createdAt, since)));
  return total;
};

/** Inserts a tenant; kind, status, restrictions and subscription take their column defaults. */
export const insertTenant = async (ctx: DbContext, { values }: { values: InsertTenantModel }): Promise<TenantModel> => {
  const [tenant] = await ctx.var.db.insert(tenantsTable).values(values).returning();
  return tenant;
};

/** Writes `values` to a tenant; its response columns, or undefined for an unknown id. */
export const updateTenant = async (ctx: DbContext, { id, values }: { id: string; values: Partial<InsertTenantModel> }) => {
  const [updated] = await ctx.var.db.update(tenantsTable).set(values).where(eq(tenantsTable.id, id)).returning(tenantColumns);
  return updated;
};

interface DueTenantsOpts {
  /** Tenants archived before this ISO moment are due. */
  archivedBefore: string;
  /** Tenants whose `expiresAt` lies before this ISO moment are due. */
  now: string;
}

/** The sweep's condition: read when it lists the tenants, and again under the row lock before each delete. */
const dueForRemoval = ({ archivedBefore, now }: DueTenantsOpts) =>
  or(and(eq(tenantsTable.status, 'archived'), lt(tenantsTable.statusChangedAt, archivedBefore)), lt(tenantsTable.expiresAt, now));

/** Tenants archived before `archivedBefore` or expired before `now`, the ones the removal sweep removes. */
export const findDueTenants = async (ctx: DbContext, opts: DueTenantsOpts) =>
  ctx.var.db
    .select(pick(tenantsTable, ['id', 'name', 'kind', 'status', 'statusChangedAt', 'expiresAt']))
    .from(tenantsTable)
    .where(dueForRemoval(opts));

interface DeleteDueTenantOpts extends DueTenantsOpts {
  tenantId: string;
}

/**
 * Deletes a tenant still due under `opts` and its organization in one transaction. It first locks the tenant row and
 * reads it again: a tenant restored, archived again or given more time since the sweep listed it stays, and a restore
 * that comes later waits for the delete and then finds no row. The organization goes first: its cascade takes the
 * channels, products, memberships and collaborative documents, and their delete triggers queue the stored files. The
 * tenant row then takes its service accounts, API keys and connections.
 * @returns Whether the tenant was still due and is deleted.
 */
export const deleteDueTenant = async (ctx: DbContext, { tenantId, ...due }: DeleteDueTenantOpts): Promise<boolean> =>
  ctx.var.db.transaction(async (tx) => {
    const [row] = await tx
      .select({ id: tenantsTable.id })
      .from(tenantsTable)
      .where(and(eq(tenantsTable.id, tenantId), dueForRemoval(due)))
      .for('update');
    if (!row) return false;
    await tx.delete(organizationsTable).where(eq(organizationsTable.tenantId, tenantId));
    await tx.delete(tenantsTable).where(eq(tenantsTable.id, tenantId));
    return true;
  });
