import { count } from 'drizzle-orm';
import { db } from '#/db/db';

import { OpenAPIHono } from '@hono/zod-openapi';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { register } from 'prom-client';
import { entityTables } from '#/entity-config';
import type { Env } from '#/lib/context';
import { metricsConfig } from '#/middlewares/observability/config';
import { calculateRequestsPerMinute, parsePromMetrics } from '#/modules/metrics/helpers';
import defaultHook from '#/utils/default-hook';
import { TimeSpan } from '#/utils/time-span';
import metricsRouteConfig from './routes';

// Set default hook to catch validation errors
const app = new OpenAPIHono<Env>({ defaultHook });

// Store public counts in memory with a 1-minute cache
const publicCountsCache = new Map<string, { data: Record<string, number>; expiresAt: number }>();

const metricRoutes = app
  /*
   * Get metrics
   */
  .openapi(metricsRouteConfig.getMetrics, async (ctx) => {
    const metrics = await register.metrics();

    // get count metrics
    const parsedCountMetrics = parsePromMetrics(metrics, metricsConfig.requestsTotal.name);
    const requestsPerMinute = calculateRequestsPerMinute(parsedCountMetrics);

    // get duration metrics
    // const parsedDurationMetrics = parsePromMetrics(metrics, metricsConfig.requestDuration.name);

    return ctx.json({ success: true, data: requestsPerMinute }, 200);
  })
  /*
   * Get public counts with caching
   */
  .openapi(metricsRouteConfig.getPublicCounts, async (ctx) => {
    const cacheKey = 'publicCounts';
    const cached = publicCountsCache.get(cacheKey);

    // Use cache if valid
    if (cached) {
      const isExpired = cached.expiresAt <= Date.now();
      if (!isExpired) return ctx.json({ success: true, data: cached.data }, 200);
    }

    // Fetch new counts from the database
    const countEntries = await Promise.all(
      Object.values(entityTables).map(async (table) => {
        const { name } = getTableConfig(table);
        const [result] = await db.select({ total: count() }).from(table);
        return [name, result.total];
      }),
    );

    const data = Object.fromEntries(countEntries);

    // Store in cache with a 1-minute expiration
    const expiresAt = Date.now() + new TimeSpan(1, 'm').milliseconds();
    publicCountsCache.set(cacheKey, { data, expiresAt });

    return ctx.json({ success: true, data }, 200);
  });

export default metricRoutes;
