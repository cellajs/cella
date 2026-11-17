import { OpenAPIHono } from '@hono/zod-openapi';
import type { Env } from '#/core/context';
import { getUnseenCountsOp } from '#/modules/seen/operations/get-unseen-counts';
import { markSeenOp } from '#/modules/seen/operations/mark-seen';
import { seenRoutes } from '#/modules/seen/seen-routes';

const app = new OpenAPIHono<Env>();

app.openapi(seenRoutes.markSeen, async (ctx) => {
  const { productIds, productType } = ctx.req.valid('json');
  return ctx.json(await markSeenOp(ctx, productIds, productType), 200);
});

export const seenHandlers = app;

const unseenApp = new OpenAPIHono<Env>();

unseenApp.openapi(seenRoutes.getUnseenCounts, async (ctx) => ctx.json(await getUnseenCountsOp(ctx), 200));

export const unseenHandlers = unseenApp;
