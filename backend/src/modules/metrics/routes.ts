import { createCustomRoute } from '#/lib/custom-routes';
import { hasSystemAccess, isAuthenticated, isPublicAccess } from '#/middlewares/guard';
import { metricListSchema, metricPublicSchema } from '#/modules/metrics/schema';
import { errorResponses } from '#/utils/schema/responses';

const metricRouteConfig = {
  getMetrics: createCustomRoute({
    operationId: 'getMetrics',
    method: 'get',
    path: '/',
    guard: [isAuthenticated, hasSystemAccess],
    tags: ['metrics'],
    summary: 'Get metrics',
    description: `EXPERIMENTAL. Returns raw system observability data (e.g. node level statistics or runtime insights).
      Primarily intended for internal monitoring and diagnostics.`,
    responses: {
      200: {
        description: 'Metrics',
        content: { 'application/json': { schema: metricListSchema } },
      },
      ...errorResponses,
    },
  }),
  getPublicCounts: createCustomRoute({
    operationId: 'getPublicCounts',
    method: 'get',
    path: '/public',
    guard: isPublicAccess,
    tags: ['metrics'],
    summary: 'Get public counts',
    description: `Returns basic count metrics for entity types such as \`users\` and \`organizations\`.
      This endpoint is public and uses a 1 minute in memory cache for performance.`,
    responses: {
      200: {
        description: 'Public counts',
        content: { 'application/json': { schema: metricPublicSchema } },
      },
      ...errorResponses,
    },
  }),
};
export default metricRouteConfig;
