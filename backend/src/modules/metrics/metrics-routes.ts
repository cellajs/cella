import { createXRoutes, json, xRoute } from '#/core/x-routes';
import { publicGuard } from '#/middlewares/guard';
import { isNoBot } from '#/middlewares/is-no-bot';
import { publicCountsSchema } from '#/modules/metrics/metrics-schema';
import { mockPublicCountsResponse } from './metrics-mocks';

const metricRouteConfig = createXRoutes(['metrics', 'cella'], {
  getPublicCounts: xRoute({
    method: 'get',
    path: '/public',
    xGuard: [publicGuard],
    middleware: isNoBot,
    summary: 'Get public counts',
    description: `Returns basic count metrics for entity types such as users and organizations.
      This endpoint is public and uses a 1 minute in memory cache for performance.`,
    responses: { 200: json('Public counts', publicCountsSchema, mockPublicCountsResponse()) },
  }),
});

export { metricRouteConfig };
