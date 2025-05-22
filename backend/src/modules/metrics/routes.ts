import { createCustomRoute } from '#/lib/custom-routes';
import { hasSystemAccess, isAuthenticated, isPublicAccess } from '#/middlewares/guard';
import { errorResponses, successWithDataSchema } from '#/utils/schema/responses';
import { metricListSchema, metricPublicSchema } from './schema';

class MetricRouteConfig {
  public getMetrics = createCustomRoute({
    method: 'get',
    path: '/',
    guard: [isAuthenticated, hasSystemAccess],
    tags: ['metrics'],
    summary: 'Get metrics',
    description: 'EXPERIMENTAL. Receive node observability metrics.',
    responses: {
      200: {
        description: 'Metrics',
        content: {
          'application/json': {
            schema: successWithDataSchema(metricListSchema),
          },
        },
      },
      ...errorResponses,
    },
  });

  public getPublicCounts = createCustomRoute({
    method: 'get',
    path: '/public',
    guard: isPublicAccess,
    tags: ['metrics'],
    summary: 'Get public counts',
    description: 'Get a count of all entities (ie. users, organizations). 1 minute in-memory cache.',
    responses: {
      200: {
        description: 'Public counts',
        content: {
          'application/json': {
            schema: successWithDataSchema(metricPublicSchema),
          },
        },
      },
      ...errorResponses,
    },
  });
}
export default new MetricRouteConfig();
