import { z } from '@hono/zod-openapi';
import { errorResponses, successResponseWithDataSchema, successResponseWithoutDataSchema } from '../../lib/common-responses';
import { inviteJsonSchema } from './schema';
import { createRouteConfig } from '../../lib/createRoute';
import { rateLimiter } from '../../middlewares/rate-limiter';
import { authGuard, tenantGuard } from '../../middlewares/guard';

export const getUploadTokenRouteConfig = createRouteConfig({
  method: 'get',
  path: '/upload-token',
  guard: authGuard(),
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

export const checkSlugRouteConfig = createRouteConfig({
  method: 'get',
  path: '/check-slug/{slug}',
  guard: authGuard(),
  tags: ['general'],
  summary: 'Check if a slug is already in use',
  request: {
    params: z.object({
      slug: z.string(),
    }),
  },
  responses: {
    200: {
      description: 'User',
      content: {
        'application/json': {
          schema: successResponseWithDataSchema(z.boolean()),
        },
      },
    },
    ...errorResponses,
  },
});

export const inviteRouteConfig = createRouteConfig({
  method: 'post',
  path: '/invite',
  guard: tenantGuard(['ADMIN']),
  middlewares: [rateLimiter({ points: 10, duration: 60 * 60, blockDuration: 60 * 10, keyPrefix: 'invite_success' }, 'success')],
  tags: ['general'],
  summary: 'Invite a new member(user) to organization or system',
  description: `
    Permissions:
      - Users with role 'ADMIN'
      - Users, who are members of the organization and have role 'ADMIN' in the organization
  `,
  request: {
    body: {
      content: {
        'application/json': {
          schema: inviteJsonSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Invitation was sent',
      content: {
        'application/json': {
          schema: successResponseWithoutDataSchema,
        },
      },
    },
    ...errorResponses,
  },
});
