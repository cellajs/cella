import { createXRoutes, json, xRoute } from '#/core/x-routes';
import { publicGuard } from '#/middlewares/guard';
import { isNoBot } from '#/middlewares/is-no-bot';
import { mockPublicCountsResponse } from '#/modules/metrics/metrics-mocks';
import { publicCountsSchema } from '#/modules/metrics/metrics-schema';

const metricRoutes = createXRoutes(['metrics', 'cella'], {
  getPublicCounts: xRoute({
    method: 'get',
    path: '/public',
    xGuard: [publicGuard],
    middleware: isNoBot,
    summary: 'Get public counts',
    description:
      'Returns the number of users and of each channel entity type, such as organizations. This endpoint is public and uses a 1 minute in memory cache for performance.',
    responses: { 200: json('Public counts', publicCountsSchema, mockPublicCountsResponse()) },
  }),
});

export { metricRoutes };
