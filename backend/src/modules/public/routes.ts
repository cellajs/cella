import { errorResponses, successResponseWithDataSchema } from '../../lib/common-responses';
import { createRouteConfig } from '../../lib/route-config';
import { isPublicAccess } from '../../middlewares/guard';
import { apiPublicCountsSchema } from './schema';

export const getPublicCountsRouteConfig = createRouteConfig({
  method: 'get',
  path: '/public/counts',
  guard: isPublicAccess,
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
