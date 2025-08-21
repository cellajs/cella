import { db } from '#/db/db';
import { membershipsTable } from '#/db/schema/memberships';
import { entityTables } from '#/entity-config';
import { type Env, getContextUser } from '#/lib/context';
import { checkSlugAvailable } from '#/modules/entities/helpers/check-slug';
import entityRoutes from '#/modules/entities/routes';
import type { contextEntitiesResponseSchema } from '#/modules/entities/schema';
import { membershipSummarySelect } from '#/modules/memberships/helpers/select';
import { defaultHook } from '#/utils/default-hook';
import { getOrderColumn } from '#/utils/order-column';
import { prepareStringForILikeFilter } from '#/utils/sql';
import { OpenAPIHono, type z } from '@hono/zod-openapi';
import { appConfig } from 'config';
import { and, eq, isNotNull, isNull, type SQLWrapper } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

const app = new OpenAPIHono<Env>({ defaultHook });

const entityRouteHandlers = app
  /*
   * Get all users' context entities with admins
   */
  .openapi(entityRoutes.getContextEntities, async (ctx) => {
    const { q, sort, types, role, offset, limit, targetUserId, targetOrgId, excludeArchived } = ctx.req.valid('query');

    const { id: selfId } = getContextUser();
    const userId = targetUserId ?? selfId;

    const selectedTypes = new Set(types ?? appConfig.contextEntityTypes);

    const baseMembershipQueryFilters = [
      eq(membershipsTable.userId, userId),
      isNotNull(membershipsTable.activatedAt),
      isNull(membershipsTable.tokenId),
    ];

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

    const contextQueries = appConfig.contextEntityTypes.map((entityType) => {
      if (!selectedTypes.has(entityType)) return null;

      const table = entityTables[entityType];
      const entityIdField = appConfig.entityIdFields[entityType];
      if (!table) return null;

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
          and(...baseMembershipQueryFilters, eq(membershipsTable[entityIdField], table.id), eq(membershipsTable.contextType, entityType)),
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

      return query
        .where(
          and(
            ...(excludeArchived ? [eq(membershipsTable.archived, false)] : []),
            ...(role ? [eq(membershipsTable.role, role)] : []),
            ...(q ? [eq(table.name, prepareStringForILikeFilter(q))] : []),
          ),
        )
        .orderBy(orderColumn)
        .limit(limit)
        .offset(offset);
    });

    const queriesData = await Promise.all(contextQueries.map((query) => (query ? query : Promise.resolve([]))));

    const data = {
      items: Object.fromEntries(appConfig.contextEntityTypes.map((entityType, i) => [entityType, queriesData[i] ?? []])) as z.infer<
        typeof contextEntitiesResponseSchema
      >['items'],
      total: queriesData.reduce((sum, rows) => sum + rows.length, 0),
    };

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
