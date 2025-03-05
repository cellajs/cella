import { OpenAPIHono } from '@hono/zod-openapi';
import { type Env, getContextMemberships, getContextUser } from '#/lib/context';

import defaultHook from '#/utils/default-hook';
import { checkSlugAvailable } from './helpers/check-slug';
import { getEntitiesQuery } from './helpers/entities-query';
import entitiesRouteConfig from './routes';

// Set default hook to catch validation errors
const app = new OpenAPIHono<Env>({ defaultHook });

const entitiesRoutes = app
  /*
   * Get entities with a limited schema
   */
  .openapi(entitiesRouteConfig.getEntitiesConfig, async (ctx) => {
    const { q, type, entityId } = ctx.req.valid('query');

    const user = getContextUser();
    const memberships = getContextMemberships();

    // Retrieve organizationIds
    const organizationIds = memberships.filter((el) => el.type === 'organization').map((el) => String(el.organizationId));

    if (!organizationIds.length) return ctx.json({ success: true, data: { items: [], total: 0 } }, 200);

    // Array to hold queries for concurrent execution
    const queries = await getEntitiesQuery({ userId: user.id, organizationIds, type, q, entityId });

    const items = (await Promise.all(queries)).flat();

    return ctx.json({ success: true, data: { items, total: items.length } }, 200);
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
