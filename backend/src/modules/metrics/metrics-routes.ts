import { createXRoute } from '#/core/x-routes';
import { publicGuard } from '#/middlewares/guard';
import { isNoBot } from '#/middlewares/is-no-bot';
import { publicCountsSchema } from '#/modules/metrics/metrics-schema';
import { errorResponseRefs } from '#/schemas';
import { mockPublicCountsResponse } from './metrics-mocks';

const metricRouteConfig = {
  /**
   * Get public counts
   */
  getPublicCounts: createXRoute({
    operationId: 'getPublicCounts',
    method: 'get',
    path: '/public',
    xGuard: [publicGuard],
    middleware: isNoBot,
    tags: ['metrics', 'cella'],
    summary: 'Get public counts',
    description: `Returns basic count metrics for entity types such as users and organizations.
      This endpoint is public and uses a 1 minute in memory cache for performance.`,
    responses: {
      200: {
        description: 'Public counts',
        content: { 'application/json': { schema: publicCountsSchema, example: mockPublicCountsResponse() } },
      },
      ...errorResponseRefs,
    },
  }),
};

export { metricRouteConfig };
