import { count } from 'drizzle-orm';
import { db } from '#/db/db';

import { getTableConfig } from 'drizzle-orm/pg-core';
import { register } from 'prom-client';
import { entityTables } from '#/entity-config';
import { calculateRequestsPerMinute, parsePromMetrics } from '#/modules/metrics/helpers/utils';
import { CustomHono } from '#/types/common';
import MetricsRoutesConfig from './routes';

const app = new CustomHono();

// Metric endpoints
const metricRoutes = app
  /*
   * Get metrics
   */
  .openapi(MetricsRoutesConfig.getMetrics, async (ctx) => {
    const metrics = await register.metrics();

    const parsedMetrics = parsePromMetrics(metrics);
    const requestsPerMinute = calculateRequestsPerMinute(parsedMetrics);

    return ctx.json({ success: true, data: requestsPerMinute }, 200);
  })
  /*
   * Get public counts
   */
  .openapi(MetricsRoutesConfig.getPublicCounts, async (ctx) => {
    const countEntries = await Promise.all(
      Object.values(entityTables).map(async (table) => {
        const { name } = getTableConfig(table);
        const [result] = await db.select({ total: count() }).from(table);
        return [name, result.total];
      }),
    );

    const data = Object.fromEntries(countEntries);

    return ctx.json({ success: true, data }, 200);
  });

export default metricRoutes;
