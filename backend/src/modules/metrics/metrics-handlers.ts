import { OpenAPIHono } from '@hono/zod-openapi';
import type { Env } from '#/core/context';
import { metricRoutes } from '#/modules/metrics/metrics-routes';
import { getPublicCountsOp } from '#/modules/metrics/operations/get-public-counts';
import { defaultHook } from '#/utils/default-hook';

const app = new OpenAPIHono<Env>({ defaultHook });

app.openapi(metricRoutes.getPublicCounts, async (ctx) => {
  const data = await getPublicCountsOp(ctx);
  return ctx.json(data, 200);
});

export const metricHandlers = app;
