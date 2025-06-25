import { OpenAPIHono, type z } from '@hono/zod-openapi';
import { config } from 'config';
import { and, eq, ilike, inArray, isNotNull } from 'drizzle-orm';

import { db } from '#/db/db';
import { membershipsTable } from '#/db/schema/memberships';
import { usersTable } from '#/db/schema/users';
import { entityTables } from '#/entity-config';
import { type Env, getContextMemberships, getContextUser } from '#/lib/context';
import { errorResponse } from '#/lib/errors';
import { checkSlugAvailable } from '#/modules/entities/helpers/check-slug';
import { getEntitiesQuery } from '#/modules/entities/helpers/entities-query';
import { processEntitiesData } from '#/modules/entities/helpers/process-entities-data';
import entityRoutes from '#/modules/entities/routes';
import type { userSummarySchema } from '#/modules/entities/schema';
import { membershipSummarySelect } from '#/modules/memberships/helpers/select';
import { userSummarySelect } from '#/modules/users/helpers/select';
import { defaultHook } from '#/utils/default-hook';
import { getOrderColumn } from '#/utils/order-column';
import { prepareStringForILikeFilter } from '#/utils/sql';

const app = new OpenAPIHono<Env>({ defaultHook });

const entityRouteHandlers = app
  /*
   * Get page entities with a limited schema
   TODO getPageEntities and getContextEntities should be merged into a single endpoint? Also why does BaseEntitySchema only include the organization entityType?
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

    if (!organizationIds.length) return ctx.json( { items: [], total: 0, counts: { user: 0, organization: 0 } }, 200);

    // Prepare query and execute in parallel
    const queries = getEntitiesQuery({ q, organizationIds, userId, selfId, type, userMembershipType });
    const queryData = await Promise.all(queries);

    // Aggregate and process result data
    const { counts, items, total } = processEntitiesData(queryData, type);

    return ctx.json( { items, total, counts }, 200);
  })
  /*
   * Get all users' context entities
   */
  .openapi(entityRoutes.getContextEntities, async (ctx) => {
    const { q, sort, type, roles, targetUserId } = ctx.req.valid('query');

    const { id: selfId } = getContextUser();

    const userId = targetUserId ?? selfId;

    const table = entityTables[type];
    const entityIdField = config.entityIdFields[type];
    if (!table) return errorResponse(ctx, 404, 'not_found', 'warn', type);

    const orderColumn = getOrderColumn({ name: table.name, createdAt: table.createdAt }, sort, table.createdAt);

    const entities = await db
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
      .innerJoin(
        membershipsTable,
        and(
          eq(membershipsTable[entityIdField], table.id),
          eq(membershipsTable.userId, userId),
          eq(membershipsTable.contextType, type),
          ...(roles?.length ? [inArray(membershipsTable.role, roles)] : []),
        ),
      )
      .where(q ? ilike(table.name, prepareStringForILikeFilter(q)) : undefined)
      .orderBy(orderColumn);

    const entityIds = entities.map(({ id }) => id);

    const members = await db
      .select({
        userData: userSummarySelect,
        entityId: membershipsTable[entityIdField],
      })
      .from(membershipsTable)
      .innerJoin(usersTable, eq(usersTable.id, membershipsTable.userId))
      .where(and(inArray(membershipsTable[entityIdField], entityIds), eq(membershipsTable.contextType, type)));

    // Group members by entityId
    const membersByEntityId = members.reduce<Record<string, z.infer<typeof userSummarySchema>[]>>((acc, { entityId, userData }) => {
      if (!entityId) return acc;
      if (!acc[entityId]) acc[entityId] = [];
      acc[entityId].push(userData);

      return acc;
    }, {});

    // Enrich entities with members
    const data = entities.map((entity) => ({
      ...entity,
      members: membersByEntityId[entity.id] ?? [],
    }));
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
