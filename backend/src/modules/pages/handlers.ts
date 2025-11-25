import { OpenAPIHono } from '@hono/zod-openapi';
import { EntityType } from 'config';
import { type Env } from '#/lib/context';
import { AppError } from '#/lib/errors';
import pagesRoutes from '#/modules/pages/routes';
import { defaultHook } from '#/utils/default-hook';
import { proxyElectricSync } from '#/utils/electric';

const app = new OpenAPIHono<Env>({ defaultHook });

const pagesRouteHandlers = app
  /**
   * Proxy to electric for syncing to client
   * Hono handlers are executed in registration order,
   * so registered first to avoid route collisions.
   */
  .openapi(pagesRoutes.shapeProxy, async (ctx) => {
    const { table, ...query } = ctx.req.valid('query');

    if (table !== 'pages') {
      throw new AppError({ status: 403, type: 'forbidden', severity: 'warn', meta: { toastMessage: 'Denied: table name mismatch.' } });
    }

    if (!query.where) {
      throw new AppError({ status: 403, type: 'forbidden', severity: 'warn', meta: { toastMessage: 'Denied: no organization ID provided.' } });
    }

    // validate organization?

    return await proxyElectricSync(table as EntityType, query);
  })
  /**
   * Create Pages
   */
  .openapi(pagesRoutes.getPages, async (ctx) => {
    // const user = getContextUser();
    // const organization = getContextOrganization();

    // const response = await getPages(ctx.req.valid('query'));

    return ctx.json({ items: [], counts: { total: 0 } }, 200);
  })
  /**
   * Get Pages
   */
  .openapi(pagesRoutes.createPages, async (ctx) => {
    // const user = getContextUser();
    // const organization = getContextOrganization();

    console.log(await ctx.req.json());
    return ctx.json([], 200);
  })
  /**
   * Get page by id
   */
  .openapi(pagesRoutes.getPage, async (ctx) => {
    // const { id } = ctx.req.valid('param');
    return ctx.json({}, 200);
  });

export default pagesRouteHandlers;
