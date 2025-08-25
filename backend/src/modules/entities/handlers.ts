import { db } from '#/db/db';
import { membershipsTable } from '#/db/schema/memberships';
import { usersTable } from '#/db/schema/users';
import { entityTables } from '#/entity-config';
import { type Env, getContextMemberships, getContextUser } from '#/lib/context';
import { AppError } from '#/lib/errors';
import { checkSlugAvailable } from '#/modules/entities/helpers/check-slug';
import { getEntitiesQuery } from '#/modules/entities/helpers/entities-query';
import { processEntitiesData } from '#/modules/entities/helpers/process-entities-data';
import entityRoutes from '#/modules/entities/routes';
import type { userBaseSchema } from '#/modules/entities/schema';
import { membershipSummarySelect } from '#/modules/memberships/helpers/select';
import { userSummarySelect } from '#/modules/users/helpers/select';
import { getValidContextEntity } from '#/permissions/get-context-entity';
import { defaultHook } from '#/utils/default-hook';
import { getOrderColumn } from '#/utils/order-column';
import { prepareStringForILikeFilter } from '#/utils/sql';
import { OpenAPIHono, type z } from '@hono/zod-openapi';
import { appConfig, type ContextEntityType } from 'config';
import { and, eq, ilike, inArray, isNotNull, isNull, or } from 'drizzle-orm';

const app = new OpenAPIHono<Env>({ defaultHook });

const entityRouteHandlers = app
  .openapi(entityRoutes.getEntity, async (ctx) => {
    const { idOrSlug } = ctx.req.valid('param');
    const { type: targetEntityType } = ctx.req.valid('query');

    const contextTypes: readonly string[] = appConfig.contextEntityTypes;

    if (contextTypes.includes(targetEntityType)) {
      const { entity } = await getValidContextEntity(idOrSlug, targetEntityType as ContextEntityType, 'read');

      return ctx.json(
        {
          id: entity.id,
          slug: entity.slug,
          name: entity.name,
          entityType: entity.entityType,
          thumbnailUrl: entity.thumbnailUrl,
          bannerUrl: entity.bannerUrl,
        },
        200,
      );
    }
    const table = entityTables[targetEntityType];
    if (!table) throw new AppError({ status: 404, type: 'not_found', severity: 'warn', entityType: targetEntityType });

    const [entity] = await db
      .select({
        id: table.id,
        slug: table.slug,
        name: table.name,
        entityType: table.entityType,
        thumbnailUrl: table.thumbnailUrl,
        bannerUrl: table.bannerUrl,
      })
      .from(table)
      .where(and(or(eq(table.id, idOrSlug), eq(table.slug, idOrSlug)), eq(table.entityType, targetEntityType)))
      .limit(1);

    if (!entity) throw new AppError({ status: 404, type: 'not_found', severity: 'warn', entityType: targetEntityType });

    return ctx.json(entity, 200);
  })
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
  .openapi(entityRoutes.getEntitiesWithAdmins, async (ctx) => {
    const { q, sort, type, role, targetUserId } = ctx.req.valid('query');

    const { id: selfId } = getContextUser();

    const userId = targetUserId ?? selfId;

    const table = entityTables[type];
    const entityIdField = appConfig.entityIdFields[type];
    if (!table) throw new AppError({ status: 404, type: 'not_found', severity: 'warn', entityType: type });

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
          isNull(membershipsTable.tokenId),
          isNotNull(membershipsTable.activatedAt),
          ...(role ? [eq(membershipsTable.role, role)] : []),
        ),
      )
      .where(q ? ilike(table.name, prepareStringForILikeFilter(q)) : undefined)
      .orderBy(orderColumn);

    const entityIds = entities.map(({ id }) => id);

    const admins = await db
      .select({
        userData: userSummarySelect,
        entityId: membershipsTable[entityIdField],
      })
      .from(membershipsTable)
      .innerJoin(usersTable, eq(usersTable.id, membershipsTable.userId))
      .where(
        and(
          inArray(membershipsTable[entityIdField], entityIds),
          eq(membershipsTable.contextType, type),
          eq(membershipsTable.role, 'admin'),
          isNotNull(membershipsTable.activatedAt),
        ),
      );

    // Group admins by entityId
    const membersByEntityId = admins.reduce<Record<string, z.infer<typeof userBaseSchema>[]>>((acc, { entityId, userData }) => {
      if (!entityId) return acc;
      if (!acc[entityId]) acc[entityId] = [];
      acc[entityId].push(userData);

      return acc;
    }, {});

    // Enrich entities with admins
    const data = entities.map((entity) => ({
      ...entity,
      admins: membersByEntityId[entity.id] ?? [],
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
