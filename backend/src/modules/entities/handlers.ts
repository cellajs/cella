import { OpenAPIHono, type z } from '@hono/zod-openapi';
import { and, eq, isNotNull } from 'drizzle-orm';

import { db } from '#/db/db';
import { membershipsTable } from '#/db/schema/memberships';
import { type Env, getContextMemberships, getContextUser } from '#/lib/context';
import { checkSlugAvailable } from '#/modules/entities/helpers/check-slug';
import { getEntitiesQuery } from '#/modules/entities/helpers/entities-query';
import entityRoutes from '#/modules/entities/routes';
import { defaultHook } from '#/utils/default-hook';
import { processEntitiesData } from './helpers/process-entities-data';
import type { entityListItemSchema } from './schema';

// Set default hook to catch validation errors
const app = new OpenAPIHono<Env>({ defaultHook });

const entityRouteHandlers = app
  /*
   * Get entities with a limited schema
   */
  .openapi(entityRoutes.getEntities, async (ctx) => {
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

    if (!organizationIds.length) return ctx.json({ success: true, data: { items: [], total: 0, counts: {} } }, 200);

    // Prepare query and execute in parallel
    const queries = getEntitiesQuery({ q, organizationIds, userId, selfId, type, userMembershipType });
    // TODO: fix typing in getEntitiesQuery return
    const queryData = (await Promise.all(queries)) as unknown as (z.infer<typeof entityListItemSchema> & { total: number })[][];

    // Aggregate and process result data
    const { counts, items, total } = processEntitiesData(queryData, type);

    return ctx.json({ success: true, data: { items, total, counts } }, 200);
  })
  /*
   * Check if slug is available
   */
  .openapi(entityRoutes.checkSlug, async (ctx) => {
    const { slug } = ctx.req.valid('json');

    const slugAvailable = await checkSlugAvailable(slug);

    return ctx.json({ success: slugAvailable }, 200);
  });

export default entityRouteHandlers;
