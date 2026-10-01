import { OpenAPIHono } from '@hono/zod-openapi';
import type { Env } from '#/core/context';
import { oauthServerRoutes } from '#/modules/oauth-server/oauth-server-routes';
import { protectedResourceMetadata } from '#/modules/oauth-server/resources';
import { defaultHook } from '#/utils/default-hook';

const app = new OpenAPIHono<Env>({ defaultHook });

app.openapi(oauthServerRoutes.getApiProtectedResourceMetadata, async (ctx) => {
  const { tenantId } = ctx.req.valid('param');
  return ctx.json(protectedResourceMetadata({ face: 'api', tenantId: tenantId.toLowerCase() }), 200);
});

export const oauthServerHandlers = app;
