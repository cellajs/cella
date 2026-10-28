import { and, count, eq, lt, notInArray, type SQL } from 'drizzle-orm';
import type { DbContext } from '#/core/context';
import { resolveListTotal } from '#/db/utils/list-total';
import { organizationsTable } from '#/modules/organization/organization-db';
import { normalizeRestrictions } from '#/modules/tenants/tenant-restrictions';
import { type InsertTenantModel, type TenantModel, tenantsTable } from '#/modules/tenants/tenants-db';
import { getOrderColumns } from '#/utils/order-column';
import { pick } from '#/utils/pick';
import { textSearchFilter } from '#/utils/sql';

/** Tenant columns a response carries. */
const tenantColumns = pick(tenantsTable, [
  'id',
  'name',
  'status',
  'statusChangedAt',
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

/** Tenant rows joined with the organization each holds (organizations.tenant_id is unique). */
const selectTenants = (ctx: DbContext) => {
  const { db } = ctx.var;

  return db
    .select({
      ...tenantColumns,
      organization: {
        id: organizationsTable.id,
        name: organizationsTable.name,
        slug: organizationsTable.slug,
        thumbnailUrl: organizationsTable.thumbnailUrl,
      },
    })
    .from(tenantsTable)
    .leftJoin(organizationsTable, eq(organizationsTable.tenantId, tenantsTable.id))
    .$dynamic();
};

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

interface FindTenantsPaginatedOpts {
  /** Searches the name. */
  q?: string;
  status?: TenantModel['status'];
  sort?: 'name' | 'createdAt';
  order?: 'asc' | 'desc';
  limit: number;
  offset: number;
}

/** A page of tenants, each with its organization, and the total. */
export const findTenantsPaginated = async (ctx: DbContext, opts: FindTenantsPaginatedOpts) => {
  const { db } = ctx.var;
  const { q, status, sort, order, limit, offset } = opts;

  const filter = and(q ? textSearchFilter(tenantsTable.name, q) : undefined, status ? eq(tenantsTable.status, status) : undefined);

  const orderBy = getOrderColumns({
    sort,
    order,
    fallback: ['createdAt', 'desc'],
    columns: pick(tenantsTable, ['name', 'createdAt']),
    tieBreaker: tenantsTable.id,
  });

  const itemsQuery = selectTenants(ctx)
    .where(filter)
    .orderBy(...orderBy)
    .limit(limit)
    .offset(offset)
    .then((rows) => rows.map(toTenant));

  return resolveListTotal(itemsQuery, {
    kind: 'exact',
    getTotal: async () => {
      const [{ total }] = await db.select({ total: count() }).from(tenantsTable).where(filter);
      return total;
    },
  });
};

interface FindTenantOpts {
  where: SQL | undefined;
}

/** The first tenant matching `where`, in its response shape; undefined when none matches. */
export const findTenant = async (ctx: DbContext, { where }: FindTenantOpts) => {
  const [row] = await selectTenants(ctx).where(where).limit(1);
  return row ? toTenant(row) : undefined;
};

interface FindOrphanTenantOpts {
  createdBy: string;
}

/** A tenant the user created that holds no organization yet, in its response shape; undefined when none does. */
export const findOrphanTenant = async (ctx: DbContext, { createdBy }: FindOrphanTenantOpts) => {
  const tenantsWithOrg = ctx.var.db.select({ tenantId: organizationsTable.tenantId }).from(organizationsTable);
  return findTenant(ctx, { where: and(eq(tenantsTable.createdBy, createdBy), notInArray(tenantsTable.id, tenantsWithOrg)) });
};

interface InsertTenantOpts {
  values: InsertTenantModel;
}

/** Inserts a tenant; status, restrictions and subscription take their column defaults. */
export const insertTenant = async (ctx: DbContext, { values }: InsertTenantOpts): Promise<TenantModel> => {
  const [tenant] = await ctx.var.db.insert(tenantsTable).values(values).returning();
  return tenant;
};

interface UpdateTenantOpts {
  id: string;
  values: Partial<InsertTenantModel>;
}

/** Writes `values` to a tenant; its response columns, or undefined for an unknown id. */
export const updateTenant = async (ctx: DbContext, { id, values }: UpdateTenantOpts) => {
  const { db } = ctx.var;
  const [updated] = await db.update(tenantsTable).set(values).where(eq(tenantsTable.id, id)).returning(tenantColumns);
  return updated;
};

interface FindArchivedTenantsOpts {
  /** Tenants archived before this ISO moment. */
  archivedBefore: string;
}

/** The sweep's condition: read when it lists the tenants, and again under the row lock before each delete. */
const dueForRemoval = (archivedBefore: string) => and(eq(tenantsTable.status, 'archived'), lt(tenantsTable.statusChangedAt, archivedBefore));

/** Tenants archived before `archivedBefore`, the ones the archived-tenant sweep removes. */
export const findArchivedTenants = async (ctx: DbContext, { archivedBefore }: FindArchivedTenantsOpts) => {
  return ctx.var.db
    .select({ id: tenantsTable.id, name: tenantsTable.name, statusChangedAt: tenantsTable.statusChangedAt })
    .from(tenantsTable)
    .where(dueForRemoval(archivedBefore));
};

interface DeleteArchivedTenantOpts extends FindArchivedTenantsOpts {
  tenantId: string;
}

/**
 * Deletes a tenant archived before `archivedBefore` and its organization in one transaction. It first locks the tenant
 * row and reads it again: a tenant restored, or archived again, since the sweep listed it stays, and a restore that
 * comes later waits for the delete and then finds no row. The organization goes first: its cascade takes the channels,
 * products, memberships and collaborative documents, and their delete triggers queue the stored files. The tenant row
 * then takes its service accounts, API keys and connections.
 * @returns Whether the tenant was still due and is deleted.
 */
export const deleteArchivedTenant = async (ctx: DbContext, { tenantId, archivedBefore }: DeleteArchivedTenantOpts): Promise<boolean> => {
  return ctx.var.db.transaction(async (tx) => {
    const [due] = await tx
      .select({ id: tenantsTable.id })
      .from(tenantsTable)
      .where(and(eq(tenantsTable.id, tenantId), dueForRemoval(archivedBefore)))
      .for('update');
    if (!due) return false;
    await tx.delete(organizationsTable).where(eq(organizationsTable.tenantId, tenantId));
    await tx.delete(tenantsTable).where(eq(tenantsTable.id, tenantId));
    return true;
  });
};
