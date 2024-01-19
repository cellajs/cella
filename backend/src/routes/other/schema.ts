import { createRoute, z } from '@hono/zod-openapi';
import { successResponseWithDataSchema } from '../../schemas/common';
import { getOrganizationUploadTokenParamSchema } from '../../schemas/organizations';
import { errorResponses } from '../../schemas/responses';

export const getPublicCountsRoute = createRoute({
  method: 'get',
  path: '/public/counts',
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

export const getPersonalUploadTokenRoute = createRoute({
  method: 'get',
  path: '/uploadtoken',
  summary: 'Get upload token',
  request: {
    query: z.object({
      public: z.string().optional().default('false'),
      width: z.string().optional(),
      height: z.string().optional(),
      quality: z.string().optional(),
      format: z.string().optional(),
    }),
  },
  responses: {
    200: {
      description: 'Upload token',
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

export const getOrganizationUploadTokenRoute = createRoute({
  method: 'get',
  path: '/organizations/{organizationId}/uploadtoken',
  summary: 'Get upload token',
  request: {
    params: getOrganizationUploadTokenParamSchema,
    query: z.object({
      public: z.string().optional().default('false'),
    }),
  },
  responses: {
    200: {
      description: 'Upload token with a scope for an organization',
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
