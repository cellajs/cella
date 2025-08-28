import { OpenAPIHono, type z } from '@hono/zod-openapi';
import { appConfig } from 'config';
import { and, eq, ilike, isNotNull, isNull, type SQLWrapper, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { db } from '#/db/db';
import { membershipsTable } from '#/db/schema/memberships';
import { entityTables } from '#/entity-config';
import { type Env, getContextUser } from '#/lib/context';
import { checkSlugAvailable } from '#/modules/entities/helpers/check-slug';
import { getMemberCountsQuery } from '#/modules/entities/helpers/counts';
import entityRoutes from '#/modules/entities/routes';
import type { contextEntitiesResponseSchema } from '#/modules/entities/schema';
import { membershipSummarySelect } from '#/modules/memberships/helpers/select';
import type { membershipCountSchema } from '#/modules/organizations/schema';
import { getValidContextEntity } from '#/permissions/get-context-entity';
import { defaultHook } from '#/utils/default-hook';
import { getOrderColumn } from '#/utils/order-column';
import { prepareStringForILikeFilter } from '#/utils/sql';

const app = new OpenAPIHono<Env>({ defaultHook });

const entityRouteHandlers = app
  /*
   * Get all users' context entities with members counts
   */
  .openapi(entityRoutes.getContextEntities, async (ctx) => {
    const { q, sort, types, role, offset, limit, targetUserId, targetOrgId, excludeArchived } = ctx.req.valid('query');

    // Determine user to run context query for
    const { id: selfId } = getContextUser();
    const userId = targetUserId ?? selfId;

    const selectedTypes = new Set(types ?? appConfig.contextEntityTypes);

    // Base membership filters (only activated memberships)
    const baseMembershipQueryFilters = [
      eq(membershipsTable.userId, userId),
      isNotNull(membershipsTable.activatedAt),
      isNull(membershipsTable.tokenId),
    ];

    // Subquery to find all organizations user is a member of
    const orgMembershipsSubquery = db
      .select({ orgId: membershipsTable.organizationId })
      .from(membershipsTable)
      .where(
        and(
          ...baseMembershipQueryFilters,
          ...(targetOrgId ? [eq(membershipsTable.organizationId, targetOrgId)] : []),
          eq(membershipsTable.contextType, 'organization'),
        ),
      )
      .as('userOrgs');

    // Build a query for each context entity type
    const contextQueries = appConfig.contextEntityTypes.map((entityType) => {
      // Skip types that were not selected
      if (!selectedTypes.has(entityType)) return null;

      const table = entityTables[entityType];
      const entityIdField = appConfig.entityIdFields[entityType];
      if (!table) return null;

      // Choose column to order by
      const orderColumn = getOrderColumn({ name: table.name, createdAt: table.createdAt }, sort, table.createdAt);

      // Build a subquery that returns membership counts (by role/status) for entity type.
      const membershipCountsQuery = getMemberCountsQuery(entityType);
      // Alias  memberships table for later joins (to avoid naming conflicts)
      const orgMembershipsAlias = alias(membershipsTable, 'orgMembership');

      // Base query: select entity + membership summary
      const baseQuery = db
        .select({
          id: table.id,
          slug: table.slug,
          name: table.name,
          entityType: table.entityType,
          thumbnailUrl: table.thumbnailUrl,
          createdAt: table.createdAt,
          membership: membershipSummarySelect,
          membershipCounts: sql<
            z.infer<typeof membershipCountSchema>
          >`json_build_object('admin', ${membershipCountsQuery.admin}, 'member', ${membershipCountsQuery.member}, 'pending', ${membershipCountsQuery.pending}, 'total', ${membershipCountsQuery.total})`,
        })
        .from(table)
        .leftJoin(membershipCountsQuery, eq(table.id, membershipCountsQuery.id))
        .leftJoin(
          membershipsTable,
          and(...baseMembershipQueryFilters, eq(membershipsTable[entityIdField], table.id), eq(membershipsTable.contextType, entityType)),
        );

      // Add org membership join depending on entity type:
      // - For non-organization entities, join with orgMembershipsSubquery (this respects targetOrgId if provided).
      // - For organization entities themselves, join with orgMembershipsAlias(ignores targetOrgId to avoid filtering out org itself).
      const query =
        entityType !== 'organization' && 'organizationId' in table
          ? baseQuery.innerJoin(orgMembershipsSubquery, eq(table.organizationId as SQLWrapper, orgMembershipsSubquery.orgId))
          : baseQuery.innerJoin(
              orgMembershipsAlias,
              and(
                eq(orgMembershipsAlias.userId, userId),
                isNotNull(orgMembershipsAlias.activatedAt),
                isNull(orgMembershipsAlias.tokenId),
                eq(table.id, orgMembershipsAlias.organizationId),
                eq(orgMembershipsAlias.contextType, 'organization'),
              ),
            );

      // Apply filters: exclude archived, filter by role, search query
      return query
        .where(
          and(
            ...(excludeArchived ? [eq(membershipsTable.archived, false)] : []),
            ...(role ? [eq(membershipsTable.role, role)] : []),
            ...(q ? [ilike(table.name, prepareStringForILikeFilter(q))] : []),
          ),
        )
        .orderBy(orderColumn)
        .limit(limit)
        .offset(offset);
    });

    // Execute all queries (replace skipped with empty arrays)
    const queriesData = await Promise.all(contextQueries.map((query) => (query ? query : Promise.resolve([]))));

    // Build response object: array of entities per entity type
    const data = {
      items: Object.fromEntries(appConfig.contextEntityTypes.map((entityType, i) => [entityType, queriesData[i] ?? []])) as z.infer<
        typeof contextEntitiesResponseSchema
      >['items'],
      total: queriesData.reduce((sum, rows) => sum + rows.length, 0), // total number of results
    };

    return ctx.json(data, 200);
  })
  /*
   * Get base entity info
   */
  .openapi(entityRoutes.getContextEntity, async (ctx) => {
    const { idOrSlug } = ctx.req.valid('param');
    const { entityType } = ctx.req.valid('query');

    const { entity } = await getValidContextEntity(idOrSlug, entityType, 'read');

    return ctx.json(entity, 200);
  })
  /*
   * Check if slug is available
   */
  .openapi(entityRoutes.checkSlug, async (ctx) => {
    const { slug, entityType } = ctx.req.valid('json');

    const slugAvailable = await checkSlugAvailable(slug, entityType);

    return ctx.json(slugAvailable, 200);
  });

export default entityRouteHandlers;
