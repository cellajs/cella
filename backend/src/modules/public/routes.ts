import { errorResponses, successResponseWithDataSchema } from '../../lib/common-responses';
import { apiPublicCountsSchema } from './schema';
import { createRouteConfig } from '../../lib/createRoute';
import { publicGuard } from '../../middlewares/guard';

export const getPublicCountsRouteConfig = createRouteConfig({
  method: 'get',
  path: '/public/counts',
  guard: publicGuard,
  tags: ['public'],
  summary: 'Get public counts',
  responses: {
    200: {
      description: 'Public counts',
      content: {
        'application/json': {
          schema: successResponseWithDataSchema(apiPublicCountsSchema),
        },
      },
    },
    ...errorResponses,
  },
});
