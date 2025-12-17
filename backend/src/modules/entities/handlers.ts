import { OpenAPIHono, type z } from '@hono/zod-openapi';
import { appConfig } from 'config';
import { and, count, eq, ilike, type SQLWrapper, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { db } from '#/db/db';
import { membershipsTable } from '#/db/schema/memberships';
import { entityTables } from '#/entity-config';
import { type Env, getContextUser } from '#/lib/context';
import { checkSlugAvailable } from '#/modules/entities/helpers/check-slug';
import { getMemberCountsQuery } from '#/modules/entities/helpers/counts/member';
import entityRoutes from '#/modules/entities/routes';
import { contextEntityWithCountsSchema } from '#/modules/entities/schema';
import { membershipBaseSelect } from '#/modules/memberships/helpers/select';
import type { membershipCountSchema } from '#/modules/organizations/schema';
import { defaultHook } from '#/utils/default-hook';
import { getOrderColumn } from '#/utils/order-column';
import { prepareStringForILikeFilter } from '#/utils/sql';

const app = new OpenAPIHono<Env>({ defaultHook });

const entityRouteHandlers = app
  /**
   * Get all users' context entities with members counts
   * TODO make getting counts optional with a query param?
   */
  .openapi(entityRoutes.getContextEntities, async (ctx) => {
    const { q, sort, types, role, offset, limit, targetUserId, targetOrgId, excludeArchived, orgAffiliated } = ctx.req.valid('query');

    // Get current user (or the target user if explicitly passed)
    const { id: selfId } = getContextUser();
    const userId = targetUserId ?? selfId;

    // Determine which entity types to query for
    const selectedTypes = new Set(types ?? appConfig.contextEntityTypes);

    // Shared filters for active memberships (used across entity types)
    const baseMembershipQueryFilters = [eq(membershipsTable.userId, userId)];

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
        .orderBy(orderColumn);
    });

    // Run queries in parallel to fetch items and totals per entity type
    const queryResults = await Promise.all(
      contextQueries.map(async (query) => {
        if (!query) return { items: [], total: 0 };

        // Fetch items and total count in parallel
        const [items, [{ total }]] = await Promise.all([
          query.limit(limit).offset(offset),
          db.select({ total: count() }).from(query.as('entityCount')),
        ]);

        return { items, total };
      }),
    );

    // Combine results from all entity types
    // We leave it to the client to handle pagination across types
    const { items, total } = queryResults.reduce(
      (acc, { items: batchItems, total }) => {
        acc.items.push(...(batchItems as z.infer<typeof contextEntityWithCountsSchema>[]));
        acc.total += total;
        return acc;
      },
      { items: [] as z.infer<typeof contextEntityWithCountsSchema>[], total: 0 },
    );

    return ctx.json({ items, total }, 200);
  })
  /**
   * Check if slug is available among page entities (context entities + users)
   */
  .openapi(entityRoutes.checkSlug, async (ctx) => {
    const { slug, entityType } = ctx.req.valid('json');

    const slugAvailable = await checkSlugAvailable(slug, entityType);

    return slugAvailable ? ctx.body(null, 204) : ctx.body(null, 409);
  });

export default entityRouteHandlers;
