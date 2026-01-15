import { OpenAPIHono } from '@hono/zod-openapi';
import { appConfig } from 'config';
import { count } from 'drizzle-orm';
import { register } from 'prom-client';
import type { z } from 'zod';
import { db } from '#/db/db';
import { entityTables } from '#/entity-config';
import type { Env } from '#/lib/context';
import { metricsConfig } from '#/middlewares/observability/config';
import { calculateRequestsPerMinute } from '#/modules/metrics/helpers/calculate-requests-per-minute';
import { parsePromMetrics } from '#/modules/metrics/helpers/parse-prom-metrics';
import metricRoutes from '#/modules/metrics/metrics-routes';
import type { publicCountsSchema } from '#/modules/metrics/metrics-schema';
import { defaultHook } from '#/utils/default-hook';
import { TimeSpan } from '#/utils/time-span';

const app = new OpenAPIHono<Env>({ defaultHook });

type CountsType = z.infer<typeof publicCountsSchema>;
// Store public counts in memory with a 1-minute cache
const publicCountsCache = new Map<string, { data: CountsType; expiresAt: number }>();

const metricRouteHandlers = app
  /**
   * Get metrics
   */
  .openapi(metricRoutes.getMetrics, async (ctx) => {
    const metrics = await register.metrics();

    // get count metrics
    const parsedCountMetrics = parsePromMetrics(metrics, metricsConfig.requestsTotal.name);
    const requestsPerMinute = calculateRequestsPerMinute(parsedCountMetrics);

    // get duration metrics
    // const parsedDurationMetrics = parsePromMetrics(metrics, metricsConfig.requestDuration.name);

    return ctx.json(requestsPerMinute, 200);
  })
  /**
   * Get public counts with caching
   */
  .openapi(metricRoutes.getPublicCounts, async (ctx) => {
    const cacheKey = 'publicCounts';
    const cached = publicCountsCache.get(cacheKey);

    // Use cache if valid
    if (cached) {
      const isExpired = cached.expiresAt <= Date.now();
      if (!isExpired) return ctx.json(cached.data, 200);
    }

    // Query counts for all entity types
    const countEntries = await Promise.all(
      appConfig.entityTypes.map(async (entityType) => {
        try {
          const table = entityTables[entityType];
          const [{ total }] = await db.select({ total: count() }).from(table);
          return [entityType, total];
        } catch (err) {
          // Fallback: 0 (avoids breaking all counts)
          return [entityType, 0];
        }
      }),
    );

    const data = Object.fromEntries(countEntries) as CountsType;

    // Cache result for 1 minute
    const expiresAt = Date.now() + new TimeSpan(1, 'm').milliseconds();
    publicCountsCache.set(cacheKey, { data, expiresAt });

    return ctx.json(data, 200);
  });

export default metricRouteHandlers;
