import { createXRoute } from '#/docs/x-routes';
import { hasSystemAccess, isAuthenticated, isPublicAccess } from '#/middlewares/guard';
import { isNoBot } from '#/middlewares/is-no-bot';
import {
  cacheStatsSchema,
  metricListSchema,
  publicCountsSchema,
  runtimeMetricsSchema,
} from '#/modules/metrics/metrics-schema';
import { errorResponseRefs } from '#/schemas';

const metricRouteConfig = {
  /**
   * Get metrics
   */
  getMetrics: createXRoute({
    operationId: 'getMetrics',
    method: 'get',
    path: '/',
    xGuard: [isAuthenticated, hasSystemAccess],
    tags: ['metrics'],
    summary: 'Get metrics',
    description: `EXPERIMENTAL. Returns raw system observability data (e.g. node level statistics or runtime insights).
      Primarily intended for internal monitoring and diagnostics.`,
    responses: {
      200: {
        description: 'Metrics',
        content: { 'application/json': { schema: metricListSchema } },
      },
      ...errorResponseRefs,
    },
  }),
  /**
   * Get runtime metrics (Node.js + OTel)
   */
  getRuntimeMetrics: createXRoute({
    operationId: 'getRuntimeMetrics',
    method: 'get',
    path: '/runtime',
    xGuard: [isAuthenticated, hasSystemAccess],
    tags: ['metrics'],
    summary: 'Get runtime metrics',
    description: `Returns Node.js process health metrics and OpenTelemetry runtime instrumentation data.
      Includes memory usage, CPU time, uptime, and event loop utilization.`,
    responses: {
      200: {
        description: 'Runtime metrics',
        content: { 'application/json': { schema: runtimeMetricsSchema } },
      },
      ...errorResponseRefs,
    },
  }),
  /**
   * Get public counts
   */
  getPublicCounts: createXRoute({
    operationId: 'getPublicCounts',
    method: 'get',
    path: '/public',
    xGuard: isPublicAccess,
    middleware: isNoBot,
    tags: ['metrics'],
    summary: 'Get public counts',
    description: `Returns basic count metrics for entity types such as \`users\` and \`organizations\`.
      This endpoint is public and uses a 1 minute in memory cache for performance.`,
    responses: {
      200: {
        description: 'Public counts',
        content: { 'application/json': { schema: publicCountsSchema } },
      },
      ...errorResponseRefs,
    },
  }),
  /**
   * Get entity cache statistics
   */
  getCacheStats: createXRoute({
    operationId: 'getCacheStats',
    method: 'get',
    path: '/cache',
    xGuard: [isAuthenticated, hasSystemAccess],
    tags: ['metrics'],
    summary: 'Get entity cache statistics',
    description: `Returns entity cache statistics including hit rates, sizes, and invalidations.
      Useful for monitoring cache performance and tuning.`,
    responses: {
      200: {
        description: 'Cache statistics',
        content: { 'application/json': { schema: cacheStatsSchema } },
      },
      ...errorResponseRefs,
    },
  }),
};
export default metricRouteConfig;
