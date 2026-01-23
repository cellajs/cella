import { z } from '@hono/zod-openapi';
import { mapEntitiesToSchema } from '#/utils/schema/entities-to-schema';

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
