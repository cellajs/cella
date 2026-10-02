import { OpenAPIHono } from '@hono/zod-openapi';
import type { Env } from '#/core/context';
import { AppError } from '#/core/error';
import { getYjsTokenOp } from '#/modules/yjs/operations/get-yjs-token';
import { yjsRoutes } from '#/modules/yjs/yjs-routes';
import { defaultHook } from '#/utils/default-hook';

const app = new OpenAPIHono<Env>({ defaultHook });

app.openapi(yjsRoutes.getYjsToken, async (ctx) => {
  const data = await getYjsTokenOp(ctx, ctx.req.valid('query'));
  return ctx.json(data, 200);
});

/** Yjs over HTTP is defined, so the SDK and clients can build on it, but not served yet: its operations follow. */
const notServedYet = () => new AppError(501, 'server_error', 'info', { meta: { reason: 'not_implemented' } });

app.openapi(yjsRoutes.pullYjsDocument, () => {
  throw notServedYet();
});

app.openapi(yjsRoutes.pushYjsUpdate, () => {
  throw notServedYet();
});

export const yjsHandlers = app;
