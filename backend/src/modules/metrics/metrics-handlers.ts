import { OpenAPIHono } from '@hono/zod-openapi';
import { count } from 'drizzle-orm';
import { register } from 'prom-client';
import { appConfig } from 'shared';
import type { z } from 'zod';
import { db } from '#/db/db';
import { getCacheMetrics } from '#/lib/cache-metrics';
import type { Env } from '#/lib/context';
import { entityCache } from '#/middlewares/entity-cache';
import { metricsConfig } from '#/middlewares/observability/config';
import { calculateRequestsPerMinute } from '#/modules/metrics/helpers/calculate-requests-per-minute';
import { parsePromMetrics } from '#/modules/metrics/helpers/parse-prom-metrics';
import metricRoutes from '#/modules/metrics/metrics-routes';
import type {
  cacheStatsSchema,
  publicCountsSchema,
  runtimeMetricsSchema,
  syncMetricsSchema,
} from '#/modules/metrics/metrics-schema';
import { getSyncMetrics } from '#/sync/sync-metrics';
import { entityTables } from '#/table-config';
import { metricExporter } from '#/tracing';
import { defaultHook } from '#/utils/default-hook';
import { TimeSpan } from '#/utils/time-span';

const app = new OpenAPIHono<Env>({ defaultHook });

type CountsType = z.infer<typeof publicCountsSchema>;
type RuntimeMetricsType = z.infer<typeof runtimeMetricsSchema>;
type CacheStatsType = z.infer<typeof cacheStatsSchema>;
type SyncMetricsType = z.infer<typeof syncMetricsSchema>;

// Store public counts in memory with a 1-minute cache
const publicCountsCache = new Map<string, { data: CountsType; expiresAt: number }>();

/**
 * Converts OTel metric data to a simplified JSON format.
 */
const formatOtelMetrics = () => {
  const resourceMetrics = metricExporter.getMetrics();
  const metrics: RuntimeMetricsType['otel'] = [];

  for (const rm of resourceMetrics) {
    for (const sm of rm.scopeMetrics) {
      for (const metric of sm.metrics) {
        const dataPoints = metric.dataPoints.map((dp) => {
          // Handle different value types (gauge, histogram, sum)
          let value: number | Record<string, number>;
          if ('value' in dp) {
            value = dp.value as number;
          } else if ('sum' in dp) {
            // Histogram - return summary stats
            const hist = dp as { sum?: number; count?: number; min?: number; max?: number };
            value = {
              sum: hist.sum ?? 0,
              count: hist.count ?? 0,
              min: hist.min ?? 0,
              max: hist.max ?? 0,
            };
          } else {
            value = 0;
          }

          return {
            value,
            attributes: dp.attributes
              ? Object.fromEntries(Object.entries(dp.attributes).map(([k, v]) => [k, String(v)]))
              : undefined,
            startTime: dp.startTime
              ? new Date(Number(dp.startTime[0]) * 1000 + dp.startTime[1] / 1e6).toISOString()
              : undefined,
            endTime: dp.endTime
              ? new Date(Number(dp.endTime[0]) * 1000 + dp.endTime[1] / 1e6).toISOString()
              : undefined,
          };
        });

        // Determine metric type from dataPointType
        let type: 'gauge' | 'counter' | 'histogram' | 'sum' = 'gauge';
        const dpType = String(metric.dataPointType);
        if (dpType.includes('HISTOGRAM')) type = 'histogram';
        else if (dpType.includes('SUM')) type = 'sum';
        else if (dpType.includes('COUNTER')) type = 'counter';

        metrics.push({
          name: metric.descriptor.name,
          description: metric.descriptor.description || undefined,
          unit: metric.descriptor.unit || undefined,
          type,
          dataPoints,
        });
      }
    }
  }

  return metrics;
};

const metricsRouteHandlers = app
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
   * Get runtime metrics (Node.js process + OTel instrumentation)
   */
  .openapi(metricRoutes.getRuntimeMetrics, async (ctx) => {
    const memoryUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();

    const runtimeMetrics: RuntimeMetricsType = {
      process: {
        uptime: process.uptime(),
        memory: {
          heapUsed: memoryUsage.heapUsed,
          heapTotal: memoryUsage.heapTotal,
          external: memoryUsage.external,
          rss: memoryUsage.rss,
        },
        cpu: {
          user: cpuUsage.user,
          system: cpuUsage.system,
        },
      },
      otel: formatOtelMetrics(),
    };

    return ctx.json(runtimeMetrics, 200);
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
  })
  /**
   * Get entity cache statistics
   */
  .openapi(metricRoutes.getCacheStats, async (ctx) => {
    const metrics = getCacheMetrics();
    const cacheStats = entityCache.stats();

    const response: CacheStatsType = {
      cache: {
        ...metrics,
        size: cacheStats.cacheSize,
        indexSize: cacheStats.indexSize,
        capacity: cacheStats.capacity,
        utilization: cacheStats.utilization,
      },
    };

    return ctx.json(response, 200);
  })
  /**
   * Get sync flow metrics
   */
  .openapi(metricRoutes.getSyncMetrics, async (ctx) => {
    const syncMetrics = getSyncMetrics();

    const response: SyncMetricsType = {
      messagesReceived: syncMetrics.messagesReceived,
      notificationsSent: syncMetrics.notificationsSent,
      activeConnections: syncMetrics.activeConnections,
      pgNotifyFallbacks: syncMetrics.pgNotifyFallbacks,
      recentSpanCount: syncMetrics.recentSpanCount,
      spansByName: syncMetrics.spansByName,
      avgDurationByName: syncMetrics.avgDurationByName,
      errorCount: syncMetrics.errorCount,
    };

    return ctx.json(response, 200);
  });

export default metricsRouteHandlers;
