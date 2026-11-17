import { OpenAPIHono } from '@hono/zod-openapi';
import type { Env } from '#/core/context';
import { metricRoutes } from '#/modules/metrics/metrics-routes';
import { getPublicCountsOp } from '#/modules/metrics/operations/get-public-counts';

const app = new OpenAPIHono<Env>();

app.openapi(metricRoutes.getPublicCounts, async (ctx) => ctx.json(await getPublicCountsOp(ctx), 200));

export const metricHandlers = app;
