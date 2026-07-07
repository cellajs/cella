import { OpenAPIHono } from '@hono/zod-openapi';
import type { Env } from '#/core/context';
import '#/modules/seen/seen-module';
import { getUnseenCountsOp } from '#/modules/seen/operations/get-unseen-counts';
import { markSeenOp } from '#/modules/seen/operations/mark-seen';
import { seenRoutes } from '#/modules/seen/seen-routes';
import { defaultHook } from '#/utils/default-hook';

const app = new OpenAPIHono<Env>({ defaultHook });

app.openapi(seenRoutes.markSeen, async (ctx) => {
  const { entityIds, entityType } = ctx.req.valid('json');
  const data = await markSeenOp(ctx, entityIds, entityType);
  return ctx.json(data, 200);
});

export const seenHandlers = app;

const unseenApp = new OpenAPIHono<Env>({ defaultHook });

export const unseenHandlers = unseenApp.openapi(seenRoutes.getUnseenCounts, async (ctx) => {
  const data = await getUnseenCountsOp(ctx);
  return ctx.json(data, 200);
});
