import type { z } from '@hono/zod-openapi';
import { and, count, eq, getColumns, inArray, isNull, type SQL, sql } from 'drizzle-orm';
import type { EntityRole } from 'shared';
import type { ActorContext, DbContext, UserContext } from '#/core/context';
import { preconditionWhere } from '#/core/preconditions';
import { mergeJsonbShallow } from '#/db/utils/jsonb-merge';
import { type ListTotalSource, resolveListTotal } from '#/db/utils/list-total';
import { updateStamps } from '#/db/utils/stamps';
import { channelCountersTable } from '#/modules/entities/channel-counters-db';
import { getChannelCountsSelect } from '#/modules/entities/entities-queries';
import { membershipsTable } from '#/modules/memberships/memberships-db';
import { organizationFlagsSelect, setupConfigSelect } from '#/modules/organization/helpers/select';
import { type InsertOrganizationModel, organizationsTable } from '#/modules/organization/organization-db';
import type { organizationListQuerySchema } from '#/modules/organization/organization-schema';
import { tenantsTable } from '#/modules/tenants/tenants-db';
import { getIsoDate } from '#/utils/iso-date';
import { getOrderColumns } from '#/utils/order-column';
import { searchFilter } from '#/utils/sql';

interface FindOrganizationByTenantOpts {
  tenantId: string;
}

/** The organization a tenant holds (organizations.tenant_id is unique); undefined before it is created. */
export const findOrganizationByTenant = async (ctx: DbContext, { tenantId }: FindOrganizationByTenantOpts) => {
  const [organization] = await ctx.var.db.select().from(organizationsTable).where(eq(organizationsTable.tenantId, tenantId)).limit(1);
  return organization;
};

interface CountOrganizationsByTenantOpts {
  tenantId: string;
}

/** How many organizations a tenant holds: 0 or 1, as `organizations.tenant_id` is unique. */
export const countOrganizationsByTenant = async (ctx: DbContext, { tenantId }: CountOrganizationsByTenantOpts) => {
  const { db } = ctx.var;
  const [result] = await db.select({ count: count() }).from(organizationsTable).where(eq(organizationsTable.tenantId, tenantId));
  return result.count;
};

interface InsertOrganizationsOpts {
  orgs: InsertOrganizationModel[];
}

/** Inserts organization rows and returns them as stored. */
export const insertOrganizations = async (ctx: DbContext, { orgs }: InsertOrganizationsOpts) => {
  const { db } = ctx.var;
  return db.insert(organizationsTable).values(orgs).returning();
};

interface UpdateOrganizationOpts {
  id: string;
  values: Partial<InsertOrganizationModel>;
}

/**
 * Merges organizationFlags, setupConfig and toolsConfig via jsonb || when provided. Undefined when no row matched, as
 * when a write moved the row past the request's preconditions (`preconditionWhere`).
 */
export const updateOrganization = async (ctx: ActorContext, { id, values }: UpdateOrganizationOpts) => {
  const { db, tenantId } = ctx.var;
  const { organizationFlags, setupConfig, toolsConfig, ...rest } = values;

  const updateData = {
    ...rest,
    ...(organizationFlags && { organizationFlags: mergeJsonbShallow(organizationsTable.organizationFlags, organizationFlags) }),
    ...(setupConfig && { setupConfig: mergeJsonbShallow(organizationsTable.setupConfig, setupConfig) }),
    // For toolsConfig each listed slot key replaces that slot's stored arrangement wholesale
    ...(toolsConfig && { toolsConfig: mergeJsonbShallow(organizationsTable.toolsConfig, toolsConfig) }),
  };

  const [updated] = await db
    .update(organizationsTable)
    .set(updateData)
    .where(and(eq(organizationsTable.id, id), eq(organizationsTable.tenantId, tenantId), preconditionWhere(ctx, organizationsTable)))
    .returning();
  return updated;
};

interface PublishOrganizationOpts {
  id: string;
}

/**
 * Stamps a draft organization published. Undefined when it was not a draft, when another call published it first, or
 * when a write moved it past the request's preconditions.
 */
export const publishOrganization = async (ctx: UserContext, { id }: PublishOrganizationOpts) => {
  const { db, tenantId, user } = ctx.var;
  const at = getIsoDate();
  const [published] = await db
    .update(organizationsTable)
    .set({ publishedAt: at, ...updateStamps(user.id, at) })
    .where(
      and(
        eq(organizationsTable.id, id),
        eq(organizationsTable.tenantId, tenantId),
        isNull(organizationsTable.publishedAt),
        preconditionWhere(ctx, organizationsTable),
      ),
    )
    .returning();
  return published;
};

interface FindOrganizationsPaginatedOpts extends Pick<z.infer<typeof organizationListQuerySchema>, 'sort' | 'order'> {
  isSystemAdmin: boolean;
  targetUserId: string;
  /** Limits the list, its total and its includes to these organizations; unset lists every one the target belongs to. */
  organizationIds?: string[];
  q?: string;
  offset: number;
  limit: number;
  excludeArchived?: boolean;
  role?: EntityRole;
  includeCounts: boolean;
}

/**
 * A page of organizations with its total: with `isSystemAdmin` every organization, archived tenants included; otherwise
 * the ones `targetUserId` is a member of, without archived tenants.
 */
export const findOrganizationsPaginated = async (ctx: DbContext, opts: FindOrganizationsPaginatedOpts) => {
  const { db } = ctx.var;
  const { isSystemAdmin, targetUserId, organizationIds, q, sort, order, offset, limit, excludeArchived, role, includeCounts } = opts;

  const entityType = 'organization';

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

  const search = searchFilter([organizationsTable.name], q);
  // Org-only filters belong in WHERE (safe for both admin + non-admin); an archived tenant's organization lists for system admins only.
  const orgWhere: SQL[] = [
    ...(isSystemAdmin
      ? []
      : [
          sql`NOT EXISTS (SELECT 1 FROM ${tenantsTable} WHERE ${tenantsTable.id} = ${organizationsTable.tenantId} AND ${tenantsTable.status} = 'archived')`,
        ]),
    ...(search ? [search] : []),
    ...(organizationIds ? [inArray(organizationsTable.id, organizationIds)] : []),
  ];

  const orderBy = getOrderColumns({
    sort,
    order,
    columns: {
      id: organizationsTable.id,
      name: organizationsTable.name,
      createdAt: organizationsTable.createdAt,
      displayOrder: membershipsTable.displayOrder,
    },
    tieBreaker: organizationsTable.id,
  });

  const countData = includeCounts ? getChannelCountsSelect(entityType) : null;
  // Writer ids stay ids here; the operation resolves them to references for the page (`withActorRefs`).
  const selectShape = {
    ...getColumns(organizationsTable),
    organizationFlags: organizationFlagsSelect,
    setupConfig: setupConfigSelect,
    ...(countData && { counts: countData.countsSelect }),
  } as const;

  // System admins LEFT JOIN memberships and see every organization; others INNER JOIN and see only their own.
  let query = isSystemAdmin
    ? db.select(selectShape).from(organizationsTable).leftJoin(membershipsTable, membershipOn).$dynamic()
    : db.select(selectShape).from(organizationsTable).innerJoin(membershipsTable, membershipOn).$dynamic();

  if (countData) {
    query = query.leftJoin(channelCountersTable, sql`${organizationsTable.id}::text = ${channelCountersTable.channelKey}`) as typeof query;
  }

  const itemsQuery = query
    .where(and(...orgWhere))
    .orderBy(...orderBy)
    .limit(limit)
    .offset(offset);

  const totalSource: ListTotalSource = {
    kind: 'exact',
    getTotal: async () => {
      if (isSystemAdmin) {
        const [{ total }] = await db
          .select({ total: count() })
          .from(organizationsTable)
          .where(and(...orgWhere));
        return total;
      }

      const baseQuery = db
        .select({ id: organizationsTable.id })
        .from(organizationsTable)
        .innerJoin(membershipsTable, membershipOn)
        .where(and(...orgWhere))
        .as('organizations');
      const [{ total }] = await db.select({ total: count() }).from(baseQuery);
      return total;
    },
  };

  return resolveListTotal(itemsQuery, totalSource);
};
