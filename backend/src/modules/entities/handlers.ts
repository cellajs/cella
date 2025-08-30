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
import { membershipBaseSelect } from '#/modules/memberships/helpers/select';
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
    const { q, sort, types, role, offset, limit, targetUserId, targetOrgId, excludeArchived, orgAffiliated } = ctx.req.valid('query');

    // Get current user (or the target user if explicitly passed)
    const { id: selfId } = getContextUser();
    const userId = targetUserId ?? selfId;

    // Determine which entity types to query for
    const selectedTypes = new Set(types ?? appConfig.contextEntityTypes);

    // Shared filters for active memberships (used across entity types)
    const baseMembershipQueryFilters = [
      eq(membershipsTable.userId, userId),
      isNotNull(membershipsTable.activatedAt),
      isNull(membershipsTable.tokenId),
    ];

    // Subquery to get all organizations the user is a member of (optionally narrowed down if `targetOrgId` is passed)
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

    // Build a query per context entity type
    const contextQueries = appConfig.contextEntityTypes.map((entityType) => {
      // Skip if this type isn’t requested
      if (!selectedTypes.has(entityType)) return null;

      const table = entityTables[entityType];
      const entityIdField = appConfig.entityIdFields[entityType];
      if (!table) return null;

      // Choose ordering column (sort by name/createdAt/etc depending on query)
      const orderColumn = getOrderColumn({ name: table.name, createdAt: table.createdAt }, sort, table.createdAt);

      // Subquery to compute membership counts (per role/status) for this entity type
      const membershipCountsQuery = getMemberCountsQuery(entityType);

      // Alias memberships table for joins to avoid conflicts
      const orgMembershipsAlias = alias(membershipsTable, 'orgMembership');

      const membershipFilters = and(
        ...baseMembershipQueryFilters,
        eq(membershipsTable[entityIdField], table.id),
        eq(membershipsTable.contextType, entityType),
      );

      // Base query: entity + membership summary
      const baseQuery = db
        .select({
          id: table.id,
          slug: table.slug,
          name: table.name,
          entityType: table.entityType,
          thumbnailUrl: table.thumbnailUrl,
          createdAt: table.createdAt,
          membership: membershipBaseSelect,
          membershipCounts: sql<z.infer<typeof membershipCountSchema>>`json_build_object(
            'admin', ${membershipCountsQuery.admin},
            'member', ${membershipCountsQuery.member},
            'pending', ${membershipCountsQuery.pending},
            'total', ${membershipCountsQuery.total}
          )`,
        })
        .from(table)
        .leftJoin(membershipCountsQuery, eq(table.id, membershipCountsQuery.id));

      // Join user’s membership in this entity, for org-affiliated left join otherwise inner
      const membershipQuery = orgAffiliated
        ? baseQuery.leftJoin(membershipsTable, membershipFilters)
        : baseQuery.innerJoin(membershipsTable, membershipFilters);

      // Organization membership filtering
      //   - For non-org entities: join with orgMembershipsSubquery (respects `targetOrgId`)
      //   - For org entities: join with orgMembershipsAlias (avoids filtering out the org itself)
      const query = orgAffiliated
        ? entityType !== 'organization' && 'organizationId' in table
          ? membershipQuery.innerJoin(orgMembershipsSubquery, eq(table.organizationId as SQLWrapper, orgMembershipsSubquery.orgId))
          : membershipQuery.innerJoin(
              orgMembershipsAlias,
              and(
                eq(orgMembershipsAlias.userId, userId),
                isNotNull(orgMembershipsAlias.activatedAt),
                isNull(orgMembershipsAlias.tokenId),
                eq(table.id, orgMembershipsAlias.organizationId),
                eq(orgMembershipsAlias.contextType, 'organization'),
              ),
            )
        : membershipQuery;

      // Apply query filters (search, role, excludeArchived)
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

    // Run all queries (replace skipped entity types with empty arrays)
    const queriesData = await Promise.all(contextQueries.map((query) => (query ? query : Promise.resolve([]))));

    // Build response payload
    const data = {
      items: Object.fromEntries(appConfig.contextEntityTypes.map((entityType, i) => [entityType, queriesData[i] ?? []])) as z.infer<
        typeof contextEntitiesResponseSchema
      >['items'],
      total: queriesData.reduce((sum, rows) => sum + rows.length, 0), // total across all entity types
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
