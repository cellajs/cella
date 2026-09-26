import { OpenAPIHono } from '@hono/zod-openapi';
import type { Env } from '#/core/context';
import { getYjsTokenOp } from '#/modules/yjs/operations/get-yjs-token';
import { yjsRoutes } from '#/modules/yjs/yjs-routes';
import { defaultHook } from '#/utils/default-hook';

const app = new OpenAPIHono<Env>({ defaultHook });

app.openapi(yjsRoutes.getYjsToken, async (ctx) => {
  const data = await getYjsTokenOp(ctx, ctx.req.valid('query'));
  return ctx.json(data, 200);
});

export const yjsHandlers = app;
