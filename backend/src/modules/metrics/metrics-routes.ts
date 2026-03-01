import { createXRoute } from '#/docs/x-routes';
import { authGuard, publicGuard, sysAdminGuard } from '#/middlewares/guard';
import { isNoBot } from '#/middlewares/is-no-bot';
import { singlePointsLimiter } from '#/middlewares/rate-limiter/limiters';
import {
  cacheStatsSchema,
  metricListSchema,
  publicCountsSchema,
  runtimeMetricsSchema,
  syncMetricsSchema,
} from '#/modules/metrics/metrics-schema';
import { errorResponseRefs } from '#/schemas';
import {
  mockCacheStatsResponse,
  mockMetricsListResponse,
  mockPublicCountsResponse,
  mockRuntimeMetricsResponse,
  mockSyncMetricsResponse,
} from '../../../mocks/mock-metrics';

const metricRouteConfig = {
  /**
   * Get metrics
   */
  getMetrics: createXRoute({
    operationId: 'getMetrics',
    method: 'get',
    path: '/',
    xGuard: [authGuard, sysAdminGuard],
    xRateLimiter: singlePointsLimiter,
    tags: ['metrics'],
    summary: 'Get metrics',
    description: `EXPERIMENTAL. Returns raw system observability data (e.g. node level statistics or runtime insights).
      Primarily intended for internal monitoring and diagnostics.`,
    responses: {
      200: {
        description: 'Metrics',
        content: { 'application/json': { schema: metricListSchema, example: mockMetricsListResponse() } },
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
    xGuard: [authGuard, sysAdminGuard],
    xRateLimiter: singlePointsLimiter,
    tags: ['metrics'],
    summary: 'Get runtime metrics',
    description: `Returns Node.js process health metrics and OpenTelemetry runtime instrumentation data.
      Includes memory usage, CPU time, uptime, and event loop utilization.`,
    responses: {
      200: {
        description: 'Runtime metrics',
        content: { 'application/json': { schema: runtimeMetricsSchema, example: mockRuntimeMetricsResponse() } },
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
    xGuard: publicGuard,
    middleware: isNoBot,
    tags: ['metrics'],
    summary: 'Get public counts',
    description: `Returns basic count metrics for entity types such as \`users\` and \`organizations\`.
      This endpoint is public and uses a 1 minute in memory cache for performance.`,
    responses: {
      200: {
        description: 'Public counts',
        content: { 'application/json': { schema: publicCountsSchema, example: mockPublicCountsResponse() } },
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
    xGuard: [authGuard, sysAdminGuard],
    xRateLimiter: singlePointsLimiter,
    tags: ['metrics'],
    summary: 'Get entity cache statistics',
    description: `Returns entity cache statistics including hit rates, sizes, and invalidations.
      Useful for monitoring cache performance and tuning.`,
    responses: {
      200: {
        description: 'Cache statistics',
        content: { 'application/json': { schema: cacheStatsSchema, example: mockCacheStatsResponse() } },
      },
      ...errorResponseRefs,
    },
  }),
  /**
   * Get sync metrics (CDC messages, ActivityBus events, SSE notifications)
   */
  getSyncMetrics: createXRoute({
    operationId: 'getSyncMetrics',
    method: 'get',
    path: '/sync',
    xGuard: [authGuard, sysAdminGuard],
    xRateLimiter: singlePointsLimiter,
    tags: ['metrics'],
    summary: 'Get sync flow metrics',
    description: `Returns metrics for the sync flow: CDC Worker (messages) → ActivityBus (events) → SSE (notifications).
      Includes message/notification counts, connection stats, and tracing span data.`,
    responses: {
      200: {
        description: 'Sync metrics',
        content: { 'application/json': { schema: syncMetricsSchema, example: mockSyncMetricsResponse() } },
      },
      ...errorResponseRefs,
    },
  }),
};
export default metricRouteConfig;
