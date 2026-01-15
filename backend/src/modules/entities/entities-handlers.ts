import { OpenAPIHono } from '@hono/zod-openapi';
import { type Env } from '#/lib/context';
import entityRoutes from '#/modules/entities/entities-routes';
import { checkSlugAvailable } from '#/modules/entities/helpers/check-slug';
import { defaultHook } from '#/utils/default-hook';

const app = new OpenAPIHono<Env>({ defaultHook });

const entityRouteHandlers = app
  /**
   * Check if slug is available among page entities (context entities + users)
   */
  .openapi(entityRoutes.checkSlug, async (ctx) => {
    const { slug, entityType } = ctx.req.valid('json');

    const slugAvailable = await checkSlugAvailable(slug, entityType);

    return slugAvailable ? ctx.body(null, 204) : ctx.body(null, 409);
  });

export default entityRouteHandlers;
