import { OpenAPIHono } from '@hono/zod-openapi';
import { appConfig, type ContextEntityType } from 'config';
import { and, eq, ilike, isNotNull, isNull, type SQLWrapper } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { db } from '#/db/db';
import { membershipsTable } from '#/db/schema/memberships';
import { entityTables } from '#/entity-config';
import { type Env, getContextMemberships, getContextUser } from '#/lib/context';
import { checkSlugAvailable } from '#/modules/entities/helpers/check-slug';
import { getEntitiesQuery } from '#/modules/entities/helpers/entities-query';
import { processEntitiesData } from '#/modules/entities/helpers/process-entities-data';
import entityRoutes from '#/modules/entities/routes';
import { membershipSummarySelect } from '#/modules/memberships/helpers/select';
import { defaultHook } from '#/utils/default-hook';
import { getOrderColumn } from '#/utils/order-column';
import { prepareStringForILikeFilter } from '#/utils/sql';

const app = new OpenAPIHono<Env>({ defaultHook });

const entityRouteHandlers = app
  /*
   * Get page entities with a limited schema
   TODO getPageEntities and getContextEntities should be merged into a single endpoint? Also why does EntityBaseSchema only include the organization entityType?
   */
  .openapi(entityRoutes.getPageEntities, async (ctx) => {
    const { q, type, targetUserId, targetOrgId, userMembershipType } = ctx.req.valid('query');

    const { id: selfId } = getContextUser();

    const userId = targetUserId ?? selfId;

    // Determine organizationIds
    let organizationIds: string[] = [];

    if (targetOrgId) {
      organizationIds = [targetOrgId];
    } else {
      const orgMemberships = targetUserId
        ? await db
            .select()
            .from(membershipsTable)
            .where(
              and(
                eq(membershipsTable.contextType, 'organization'),
                eq(membershipsTable.userId, targetUserId),
                isNotNull(membershipsTable.activatedAt),
              ),
            )
        : getContextMemberships().filter((m) => m.contextType === 'organization');

      organizationIds = orgMemberships.map((m) => m.organizationId);
    }

    if (!organizationIds.length) return ctx.json({ items: [], total: 0, counts: { user: 0, organization: 0 } }, 200);

    // Prepare query and execute in parallel
    const queries = getEntitiesQuery({ q, organizationIds, userId, selfId, type, userMembershipType });
    const queryData = await Promise.all(queries);

    // Aggregate and process result data
    const { counts, items, total } = processEntitiesData(queryData, type);

    return ctx.json({ items, total, counts }, 200);
  })
  /*
   * Get all users' context entities with admins
   */
  .openapi(entityRoutes.getContextEntities, async (ctx) => {
    const { q, sort, types, role, targetUserId } = ctx.req.valid('query');

    const { id: selfId } = getContextUser();
    const userId = targetUserId ?? selfId;

    const contextEntities = types ?? appConfig.contextEntityTypes;

    const contextQueries = [];

    const baseMembershipQueryFilters = [
      eq(membershipsTable.userId, userId),
      isNotNull(membershipsTable.activatedAt),
      isNull(membershipsTable.tokenId),
    ];

    const orgMembershipsSubquery = db
      .select({ orgId: membershipsTable.organizationId })
      .from(membershipsTable)
      .where(and(...baseMembershipQueryFilters, eq(membershipsTable.contextType, 'organization')))
      .as('userOrgs');

    for (const entityType of contextEntities) {
      const table = entityTables[entityType];
      const entityIdField = appConfig.entityIdFields[entityType];
      if (!table) continue;

      const orderColumn = getOrderColumn({ name: table.name, createdAt: table.createdAt }, sort, table.createdAt);

      const orgMembershipsAlias = alias(membershipsTable, 'orgMembership');

      const baseQuery = db
        .select({
          id: table.id,
          slug: table.slug,
          name: table.name,
          entityType: table.entityType,
          thumbnailUrl: table.thumbnailUrl,
          createdAt: table.createdAt,
          membership: membershipSummarySelect,
        })
        .from(table)
        .leftJoin(
          membershipsTable,
          and(
            ...baseMembershipQueryFilters,
            eq(membershipsTable[entityIdField], table.id),
            eq(membershipsTable.contextType, entityType),
            ...(role ? [eq(membershipsTable.role, role)] : []),
          ),
        );

      const query =
        'organizationId' in table
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

      contextQueries.push(query.where(q ? ilike(table.name, prepareStringForILikeFilter(q)) : undefined).orderBy(orderColumn));
    }

    const queriesData = await Promise.all(contextQueries);

    const data = queriesData.reduce(
      (acc, rows, index) => {
        const entityType = contextEntities[index];
        acc.items[entityType] = rows;
        // Sum total counts
        acc.total += rows.length;
        return acc;
      },
      {
        items: {} as Record<ContextEntityType, (typeof queriesData)[number]>,
        total: 0,
      },
    );

    console.log('🚀 ~ data:', data);
    return ctx.json(data, 200);
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
