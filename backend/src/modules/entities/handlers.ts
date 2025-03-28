import { OpenAPIHono } from '@hono/zod-openapi';
import { and, eq, isNotNull } from 'drizzle-orm';

import { db } from '#/db/db';
import { membershipsTable } from '#/db/schema/memberships';
import { type Env, getContextMemberships, getContextUser } from '#/lib/context';
import { checkSlugAvailable } from '#/modules/entities/helpers/check-slug';
import { getEntitiesQuery } from '#/modules/entities/helpers/entities-query';
import { processEntitiesData } from '#/modules/entities/helpers/process-entities-data';
import entitiesRouteConfig from '#/modules/entities/routes';
import defaultHook from '#/utils/default-hook';

// Set default hook to catch validation errors
const app = new OpenAPIHono<Env>({ defaultHook });

const entitiesRoutes = app
  /*
   * Get entities with a limited schema
   */
  .openapi(entitiesRouteConfig.getEntities, async (ctx) => {
    const { q, type, targetUserId, removeSelf } = ctx.req.valid('query');

    const { id: selfId } = getContextUser();

    const userId = targetUserId ?? selfId;
    const memberships = targetUserId
      ? await db
          .select()
          .from(membershipsTable)
          .where(and(eq(membershipsTable.type, 'organization'), eq(membershipsTable.userId, targetUserId), isNotNull(membershipsTable.activatedAt)))
      : getContextMemberships();

    // Retrieve valid organizationIds and cancel if none are found
    const organizationIds = memberships.filter((el) => el.type === 'organization').map((el) => String(el.organizationId));
    if (!organizationIds.length) return ctx.json({ success: true, data: { items: [], total: 0, counts: {} } }, 200);

    // Array to hold queries for concurrent execution
    const queries = await getEntitiesQuery({ userId, organizationIds, type, q, selfId: removeSelf ? selfId : null });

    const queryData = await Promise.all(queries);

    const { counts, items, total } = processEntitiesData(queryData, type);

    return ctx.json({ success: true, data: { items, total, counts } }, 200);
  })
  /*
   * Check if slug is available
   */
  .openapi(entitiesRouteConfig.checkSlug, async (ctx) => {
    const { slug } = ctx.req.valid('json');

    const slugAvailable = await checkSlugAvailable(slug);

    return ctx.json({ success: slugAvailable }, 200);
  });

export default entitiesRoutes;
