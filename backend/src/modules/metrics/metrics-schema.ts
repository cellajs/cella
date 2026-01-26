import { z } from '@hono/zod-openapi';
import { mapEntitiesToSchema } from '#/schemas';

export const publicCountsSchema = mapEntitiesToSchema(() => z.number());

export const metricListSchema = z.array(
  z.object({
    date: z.string(),
    count: z.number(),
  }),
);

/** Schema for a single OTel metric data point. */
export const otelDataPointSchema = z.object({
  value: z.union([z.number(), z.record(z.string(), z.number())]),
  attributes: z.record(z.string(), z.string()).optional(),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
});

/** Schema for a single OTel metric. */
export const otelMetricSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  unit: z.string().optional(),
  type: z.enum(['gauge', 'counter', 'histogram', 'sum']),
  dataPoints: z.array(otelDataPointSchema),
});

/** Schema for runtime metrics response including process health. */
export const runtimeMetricsSchema = z.object({
  process: z.object({
    uptime: z.number().describe('Process uptime in seconds'),
    memory: z.object({
      heapUsed: z.number().describe('Heap memory used in bytes'),
      heapTotal: z.number().describe('Total heap memory in bytes'),
      external: z.number().describe('External memory in bytes'),
      rss: z.number().describe('Resident set size in bytes'),
    }),
    cpu: z.object({
      user: z.number().describe('CPU time spent in user mode (microseconds)'),
      system: z.number().describe('CPU time spent in system mode (microseconds)'),
    }),
  }),
  otel: z.array(otelMetricSchema).describe('OpenTelemetry metrics from RuntimeNodeInstrumentation'),
});

/** Schema for cache tier stats. */
const cacheTierStatsSchema = z.object({
  hits: z.number().describe('Number of cache hits'),
  misses: z.number().describe('Number of cache misses'),
  hitRate: z.number().describe('Hit rate percentage (0-100)'),
  invalidations: z.number().describe('Number of cache invalidations'),
  coalescedRequests: z.number().describe('Number of coalesced requests (avoided duplicate fetches)'),
  totalRequests: z.number().describe('Total requests (hits + misses)'),
  uptimeSeconds: z.number().describe('Seconds since metrics were last reset'),
  size: z.number().describe('Current number of cached entries'),
  capacity: z.number().describe('Maximum cache capacity'),
  utilization: z.number().describe('Cache utilization (0-1)'),
});

/** Schema for entity cache stats response. */
export const cacheStatsSchema = z.object({
  public: cacheTierStatsSchema.describe('Public cache statistics (no auth required)'),
  token: cacheTierStatsSchema.describe('Token cache statistics (membership required)'),
  combined: z.object({
    totalHits: z.number(),
    totalMisses: z.number(),
    overallHitRate: z.number(),
    totalInvalidations: z.number(),
  }),
});
