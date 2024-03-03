import { createRoute } from '@hono/zod-openapi';
import { errorResponses, successResponseWithDataSchema } from '../../lib/common-responses';
import { apiPublicCountsSchema } from './schema';

export const getPublicCountsRoute = createRoute({
  method: 'get',
  path: '/public/counts',
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
