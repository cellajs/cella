import { and, count, eq, notInArray, type SQL, sql } from 'drizzle-orm';
import type { DbContext } from '#/core/context';
import { resolveListTotal } from '#/db/utils/list-total';
import { domainsTable } from '#/modules/domains/domains-db';
import { organizationsTable } from '#/modules/organization/organization-db';
import { normalizeRestrictions } from '#/modules/tenants/tenant-restrictions';
import { tenantsTable } from '#/modules/tenants/tenants-db';
import { getOrderColumns } from '#/utils/order-column';
import { pick } from '#/utils/pick';

/** Tenant columns a response carries; subscriptionData stays server-side. */
const tenantColumns = pick(tenantsTable, [
  'id',
  'name',
  'status',
  'restrictions',
  'authStrategies',
  'createdBy',
  'subscriptionId',
  'subscriptionStatus',
  'subscriptionPlan',
  'createdAt',
  'updatedAt',
]);

/** Tenant rows joined with their domains count and the organization each holds (organizations.tenant_id is unique). */
const selectTenants = (ctx: DbContext) => {
  const { db } = ctx.var;

  const domainsCountSq = db
    .select({ tenantId: domainsTable.tenantId, count: count().as('domains_count') })
    .from(domainsTable)
    .groupBy(domainsTable.tenantId)
    .as('domains_count_sq');

  return db
    .select({
      ...tenantColumns,
      domainsCount: sql<number>`coalesce(${domainsCountSq.count}, 0)`.mapWith(Number),
      organizationId: organizationsTable.id,
      organizationName: organizationsTable.name,
      organizationSlug: organizationsTable.slug,
      organizationThumbnailUrl: organizationsTable.thumbnailUrl,
    })
    .from(tenantsTable)
    .leftJoin(domainsCountSq, eq(tenantsTable.id, domainsCountSq.tenantId))
    .leftJoin(organizationsTable, eq(organizationsTable.tenantId, tenantsTable.id))
    .$dynamic();
};

type TenantRow = Awaited<ReturnType<typeof selectTenants>>[number];

/**
 * Folds the flat org columns into `organization` (null for an orphan tenant) and gives a stored row the
 * restriction fields it predates, so one such row cannot fail a whole list.
 */
const toTenant = ({ organizationId, organizationName, organizationSlug, organizationThumbnailUrl, ...tenant }: TenantRow) => ({
  ...tenant,
  restrictions: normalizeRestrictions(tenant.restrictions),
  organization: organizationId
    ? {
        id: organizationId,
        // Non-null within this branch: the left join returns them on the same row as the id.
        name: organizationName as string,
        slug: organizationSlug as string,
        thumbnailUrl: organizationThumbnailUrl,
        entityType: 'organization' as const,
      }
    : null,
});

interface FindTenantsPaginatedOpts {
  filters: SQL[];
  sort?: 'name' | 'createdAt';
  order?: 'asc' | 'desc';
  limit: number;
  offset: number;
}

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

  const itemsQuery = selectTenants(ctx)
    .where(whereClause)
    .orderBy(...orderBy)
    .limit(limit)
    .offset(offset)
    .then((rows) => rows.map(toTenant));

  return resolveListTotal(itemsQuery, {
    kind: 'exact',
    getTotal: async () => {
      const [{ total }] = await db.select({ total: count() }).from(tenantsTable).where(whereClause);
      return total;
    },
  });
};

/** The first tenant matching `where`, in its response shape; undefined when none matches. */
export const findTenant = async (ctx: DbContext, { where }: { where: SQL | undefined }) => {
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

interface UpdateTenantOpts {
  targetTenantId: string;
  values: Partial<typeof tenantsTable.$inferInsert>;
}

export const updateTenant = async (ctx: DbContext, { targetTenantId, values }: UpdateTenantOpts) => {
  const { db } = ctx.var;
  const [updated] = await db.update(tenantsTable).set(values).where(eq(tenantsTable.id, targetTenantId)).returning(tenantColumns);
  return updated;
};
