import { errorResponses, successResponseWithDataSchema } from '../../lib/common-responses';
import { createRoute } from '../../lib/route-config';
import { publicGuard } from '../../middlewares/guard';
import { CustomHono } from '../../types/common';
import { apiPublicCountsSchema } from './schema';

export const app = new CustomHono();

export const getPublicCountsRoute = createRoute(app, {
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
