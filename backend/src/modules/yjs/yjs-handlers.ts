import { OpenAPIHono } from '@hono/zod-openapi';
import type { Env } from '#/core/context';
import '#/modules/yjs/yjs-module';
import { env } from '#/env';
import { getYjsTokenOp } from '#/modules/yjs/operations/get-yjs-token';
import { verifyEntityOp } from '#/modules/yjs/operations/verify-entity';
import yjsRoutes from '#/modules/yjs/yjs-routes';
import { defaultHook } from '#/utils/default-hook';

const app = new OpenAPIHono<Env>({ defaultHook });

app.openapi(yjsRoutes.getYjsToken, async (ctx) => {
  const data = getYjsTokenOp(ctx.var.user.id, ctx.var.memberships, ctx.req.valid('query'));
  return ctx.json(data, 200);
});

app.openapi(yjsRoutes.verifyEntity, async (ctx) => {
  const secret = ctx.req.header('x-yjs-secret');
  if (secret !== env.YJS_SECRET) {
    return ctx.json({ allowed: false }, 200);
  }

  const data = await verifyEntityOp(ctx.req.valid('query'));
  return ctx.json(data, 200);
});

export const yjsHandlers = app;
