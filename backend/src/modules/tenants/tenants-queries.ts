import { and, count, eq, type SQL, sql } from 'drizzle-orm';
import type { DbContext } from '#/core/context';
import { resolveListTotal } from '#/db/utils/list-total';
import { domainsTable } from '#/modules/domains/domains-db';
import { tenantsTable } from '#/modules/tenants/tenants-db';
import { getOrderColumns } from '#/utils/order-column';
import { pick } from '#/utils/pick';

interface FindTenantsPaginatedOpts {
  filters: SQL[];
  sort?: 'name' | 'createdAt';
  order?: 'asc' | 'desc';
  limit: number;
  offset: number;
}

/** Get paginated tenants with domain counts. */
export const findTenantsPaginated = async (ctx: DbContext, opts: FindTenantsPaginatedOpts) => {
  const { db } = ctx.var;
  const { filters, sort, order, limit, offset } = opts;
  const whereClause = and(...filters);

  const orderBy = getOrderColumns({
    sort,
    order,
    fallback: ['createdAt', 'desc'],
    columns: pick(tenantsTable, ['name', 'createdAt']),
    tieBreaker: tenantsTable.id,
  });

  const domainsCountSq = db
    .select({ tenantId: domainsTable.tenantId, count: count().as('domains_count') })
    .from(domainsTable)
    .groupBy(domainsTable.tenantId)
    .as('domains_count_sq');

  const itemsQuery = db
    .select({
      id: tenantsTable.id,
      name: tenantsTable.name,
      status: tenantsTable.status,
      restrictions: tenantsTable.restrictions,
      authStrategies: tenantsTable.authStrategies,
      createdBy: tenantsTable.createdBy,
      subscriptionId: tenantsTable.subscriptionId,
      subscriptionStatus: tenantsTable.subscriptionStatus,
      subscriptionPlan: tenantsTable.subscriptionPlan,
      subscriptionData: tenantsTable.subscriptionData,
      domainsCount: sql<number>`coalesce(${domainsCountSq.count}, 0)`.mapWith(Number),
      createdAt: tenantsTable.createdAt,
      updatedAt: tenantsTable.updatedAt,
    })
    .from(tenantsTable)
    .leftJoin(domainsCountSq, eq(tenantsTable.id, domainsCountSq.tenantId))
    .where(whereClause)
    .orderBy(...orderBy)
    .limit(limit)
    .offset(offset);

  return resolveListTotal(itemsQuery, {
    kind: 'exact',
    getTotal: async () => {
      const [{ total }] = await db.select({ total: count() }).from(tenantsTable).where(whereClause);
      return total;
    },
  });
};

interface FindTenantByIdOpts {
  targetTenantId: string;
}

/** Find a tenant by ID. */
export const findTenantById = async (ctx: DbContext, { targetTenantId }: FindTenantByIdOpts) => {
  const { db } = ctx.var;
  const [tenant] = await db.select().from(tenantsTable).where(eq(tenantsTable.id, targetTenantId)).limit(1);
  return tenant;
};

interface UpdateTenantOpts {
  targetTenantId: string;
  values: Partial<typeof tenantsTable.$inferInsert>;
}

/** Update a tenant by ID and return the updated row. */
export const updateTenant = async (ctx: DbContext, { targetTenantId, values }: UpdateTenantOpts) => {
  const { db } = ctx.var;
  const [updated] = await db.update(tenantsTable).set(values).where(eq(tenantsTable.id, targetTenantId)).returning();
  return updated;
};

interface CountDomainsByTenantOpts {
  targetTenantId: string;
}

/** Count domains for a tenant. */
export const countDomainsByTenant = async (ctx: DbContext, { targetTenantId }: CountDomainsByTenantOpts) => {
  const { db } = ctx.var;
  const [{ domainsCount }] = await db
    .select({ domainsCount: count() })
    .from(domainsTable)
    .where(eq(domainsTable.tenantId, targetTenantId));
  return domainsCount;
};
