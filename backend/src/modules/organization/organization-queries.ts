import { and, eq, getColumns, ilike, inArray, type SQL, sql } from 'drizzle-orm';
import type { EntityRole, OrganizationFlags } from 'shared';
import type { AuthContext, DbContext } from '#/core/context';
import { channelCountersTable } from '#/modules/entities/channel-counters-db';
import { getChannelCountsSelect } from '#/modules/entities/entities-queries';
import { membershipsTable } from '#/modules/memberships/memberships-db';
import { organizationFlagsSelect } from '#/modules/organization/helpers/select';
import { organizationsTable } from '#/modules/organization/organization-db';
import { auditUserSelect, createdByUser, updatedByUser } from '#/modules/user/helpers/audit-user';
import { getOrderColumn } from '#/utils/order-column';
import { prepareStringForILikeFilter } from '#/utils/sql';

/** Count organizations in a tenant. */
export const countOrgsInTenant = async (ctx: DbContext, tenantId: string) => {
  const { db } = ctx.var;
  const [result] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(organizationsTable)
    .where(eq(organizationsTable.tenantId, tenantId));
  return result?.count ?? 0;
};

/** Insert organizations and return the created rows. */
export const insertOrganizations = async (
  ctx: DbContext,
  { orgs }: { orgs: (typeof organizationsTable.$inferInsert)[] },
) => {
  const { db } = ctx.var;
  return db.insert(organizationsTable).values(orgs).returning();
};

interface UpdateOrganizationOpts {
  id: string;
  values: Partial<typeof organizationsTable.$inferInsert> & { organizationFlags?: Partial<OrganizationFlags> };
}

/** Update an organization by ID and return the updated row. Merges organizationFlags via jsonb || if provided. */
export const updateOrganization = async (ctx: AuthContext, { id, values }: UpdateOrganizationOpts) => {
  const { db, tenantId } = ctx.var;
  const { organizationFlags, ...rest } = values;

  const updateData = {
    ...rest,
    ...(organizationFlags && {
      organizationFlags: sql`${organizationsTable.organizationFlags} || ${JSON.stringify(organizationFlags)}::jsonb`,
    }),
  };

  const [updated] = await db
    .update(organizationsTable)
    .set(updateData)
    .where(and(eq(organizationsTable.id, id), eq(organizationsTable.tenantId, tenantId)))
    .returning();
  return updated;
};

interface DeleteOrganizationsByIdsOpts {
  ids: string[];
}

/** Delete organizations by IDs. */
export const deleteOrganizationsByIds = async (ctx: AuthContext, { ids }: DeleteOrganizationsByIdsOpts) => {
  const { db, tenantId } = ctx.var;
  return db
    .delete(organizationsTable)
    .where(and(inArray(organizationsTable.id, ids), eq(organizationsTable.tenantId, tenantId)));
};

interface GetOrganizationsListOpts {
  isSystemAdmin: boolean;
  targetUserId: string;
  q?: string;
  sort?: 'id' | 'name' | 'createdAt' | 'userRole' | 'displayOrder';
  order?: 'asc' | 'desc';
  offset: number;
  limit: number;
  excludeArchived?: boolean;
  role?: EntityRole;
  includeCounts: boolean;
}

/** Get paginated list of organizations with conditional joins based on admin status. */
export const getOrganizationsList = async ({ var: { db } }: DbContext, opts: GetOrganizationsListOpts) => {
  const { isSystemAdmin, targetUserId, q, sort, order, offset, limit, excludeArchived, role, includeCounts } = opts;

  const entityType = 'organization';

  // Base membership join key (who we're attaching membership for)
  const membershipKeyOn = and(
    eq(membershipsTable.organizationId, organizationsTable.id),
    eq(membershipsTable.userId, targetUserId),
    eq(membershipsTable.channelType, entityType),
  );

  // Membership filters (role/archived) in JOIN ON so they only control whether the membership row is present.
  const membershipFilterOn = and(
    ...(excludeArchived ? [eq(membershipsTable.archived, false)] : []),
    ...(role ? [eq(membershipsTable.role, role)] : []),
  );

  const membershipOn = and(membershipKeyOn, membershipFilterOn);

  // Org-only filters belong in WHERE (safe for both admin + non-admin)
  const orgWhere: SQL[] = [...(q ? [ilike(organizationsTable.name, prepareStringForILikeFilter(q))] : [])];

  const orderColumn = getOrderColumn(sort, organizationsTable.id, order, {
    id: organizationsTable.id,
    name: organizationsTable.name,
    createdAt: organizationsTable.createdAt,
    userRole: membershipsTable.role,
    displayOrder: membershipsTable.displayOrder,
  });

  // System admins see all orgs they have RLS access to (via createdBy or membership)
  // They use LEFT JOIN since they may not have a membership row for every org.
  // Regular users use INNER JOIN on memberships (only see orgs they're members of).
  const countData = includeCounts ? getChannelCountsSelect(entityType) : null;
  const { createdBy: _cb, updatedBy: _mb, ...orgCols } = getColumns(organizationsTable);
  const selectShape = {
    ...orgCols,
    // Rows store organizationFlags sparse; merge config defaults under the stored bag
    organizationFlags: organizationFlagsSelect,
    ...auditUserSelect,
    ...(countData && { counts: countData.countsSelect }),
    total: sql<number>`count(*) over()`.mapWith(Number),
  } as const;

  // Admins use LEFT JOIN; regular users use INNER JOIN on memberships.
  let query = isSystemAdmin
    ? db.select(selectShape).from(organizationsTable).leftJoin(membershipsTable, membershipOn).$dynamic()
    : db.select(selectShape).from(organizationsTable).innerJoin(membershipsTable, membershipOn).$dynamic();

  if (countData) {
    query = query.leftJoin(
      channelCountersTable,
      sql`${organizationsTable.id}::text = ${channelCountersTable.channelKey}`,
    ) as typeof query;
  }

  return query
    .leftJoin(createdByUser, eq(createdByUser.id, organizationsTable.createdBy))
    .leftJoin(updatedByUser, eq(updatedByUser.id, organizationsTable.updatedBy))
    .where(and(...orgWhere))
    .orderBy(orderColumn)
    .limit(limit)
    .offset(offset);
};
