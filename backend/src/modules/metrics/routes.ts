import { errorResponses, successWithDataSchema } from '#/lib/common-responses';
import { createRouteConfig } from '#/lib/route-config';
import { isPublicAccess } from '#/middlewares/guard';
import { metricsSchema, publicCountsSchema } from './schema';

class MetricsRoutesConfig {
  public getMetrics = createRouteConfig({
    method: 'get',
    path: '/',
    guard: isPublicAccess,
    tags: ['metrics'],
    summary: 'Get metrics',
    responses: {
      200: {
        description: 'Metrics',
        content: {
          'application/json': {
            schema: successWithDataSchema(metricsSchema),
          },
        },
      },
      ...errorResponses,
    },
  });

  public getPublicCounts = createRouteConfig({
    method: 'get',
    path: '/public',
    guard: isPublicAccess,
    tags: ['metrics'],
    summary: 'Get public counts',
    responses: {
      200: {
        description: 'Public counts',
        content: {
          'application/json': {
            schema: successWithDataSchema(publicCountsSchema),
          },
        },
      },
      ...errorResponses,
    },
  });
}
export default new MetricsRoutesConfig();
