import { createRoute, z } from '@hono/zod-openapi';
import { successResponseWithDataSchema } from '../../schemas/common';
import { errorResponses } from '../../schemas/responses';

export const getPublicCountsRoute = createRoute({
  method: 'get',
  path: '/public/counts',
  tags: ['general'],
  summary: 'Get public counts',
  responses: {
    200: {
      description: 'Public counts',
      content: {
        'application/json': {
          schema: successResponseWithDataSchema(
            z.object({
              organizations: z.number().openapi({
                description: 'The number of organizations',
              }),
              users: z.number().openapi({
                description: 'The number of users',
              }),
            }),
          ),
        },
      },
    },
    ...errorResponses,
  },
});

export const getUploadTokenRoute = createRoute({
  method: 'get',
  path: '/uploadtoken',
  tags: ['general'],
  summary: 'Get upload token for user or organization',
  request: {
    query: z.object({
      public: z.string().optional().default('false'),
      organization: z.string().optional(),
      width: z.string().optional(),
      height: z.string().optional(),
      quality: z.string().optional(),
      format: z.string().optional(),
    }),
  },
  responses: {
    200: {
      description: 'Upload token with a scope for a user or organization',
      content: {
        'application/json': {
          schema: successResponseWithDataSchema(
            z.string().openapi({
              description: 'The upload token (JWT)',
            }),
          ),
        },
      },
    },
    ...errorResponses,
  },
});
