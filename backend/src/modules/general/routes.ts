import { z } from '@hono/zod-openapi';
import {
  errorResponses,
  successResponseWithDataSchema,
  successResponseWithPaginationSchema,
  successResponseWithoutDataSchema,
} from '../../lib/common-responses';
import { entityTypeSchema } from '../../lib/common-schemas';
import { createRouteConfig } from '../../lib/route-config';
import { isAllowedTo, isAuthenticated, isPublicAccess, isSystemAdmin } from '../../middlewares/guard';
import { authRateLimiter, rateLimiter } from '../../middlewares/rate-limiter';
import {
  acceptInviteJsonSchema,
  apiMemberSchema,
  apiPublicCountsSchema,
  checkTokenSchema,
  getMembersQuerySchema,
  inviteJsonSchema,
  suggestionsSchema,
} from './schema';

export const getPublicCountsRouteConfig = createRouteConfig({
  method: 'get',
  path: '/public/counts',
  guard: isPublicAccess,
  tags: ['general'],
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

export const getUploadTokenRouteConfig = createRouteConfig({
  method: 'get',
  path: '/upload-token',
  guard: isAuthenticated,
  tags: ['general'],
  summary: 'Get upload token',
  description:
    'This endpoint is used to get an upload token for a user or organization. The token can be used to upload public or private images/files to your S3 bucket using imado.',
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
          schema: successResponseWithDataSchema(z.string()),
        },
      },
    },
    ...errorResponses,
  },
});

export const checkSlugRouteConfig = createRouteConfig({
  method: 'get',
  path: '/check-slug/{slug}',
  guard: isAuthenticated,
  tags: ['general'],
  summary: 'Check if slug is available',
  description: 'This endpoint is used to check if a slug is available among ALL contextual entities such as organizations.',
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

export const checkTokenRouteConfig = createRouteConfig({
  method: 'get',
  path: '/check-token/{token}',
  middleware: [authRateLimiter],
  guard: isPublicAccess,
  tags: ['general'],
  summary: 'Token validation check',
  description:
    'This endpoint is used to check if a token is still valid. It is used to provide direct user feedback on the validity of tokens such as reset password and invitation.',
  request: {
    params: z.object({
      token: z.string(),
    }),
  },
  responses: {
    200: {
      description: 'Token is valid',
      content: {
        'application/json': {
          schema: successResponseWithDataSchema(checkTokenSchema),
        },
      },
    },
    ...errorResponses,
  },
});

export const inviteRouteConfig = createRouteConfig({
  method: 'post',
  path: '/invite',
  guard: [isAuthenticated, isSystemAdmin],
  middleware: [rateLimiter({ points: 10, duration: 60 * 60, blockDuration: 60 * 10, keyPrefix: 'invite_success' }, 'success')],
  tags: ['general'],
  summary: 'Invite to system',
  description: 'Invite one or more users to system by email address.',
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
      description: 'Invitations are sent',
      content: {
        'application/json': {
          schema: successResponseWithoutDataSchema,
        },
      },
    },
    ...errorResponses,
  },
});

export const acceptInviteRouteConfig = createRouteConfig({
  method: 'post',
  path: '/accept-invite/{token}',
  guard: isPublicAccess,
  middleware: [authRateLimiter],
  tags: ['general'],
  summary: 'Accept invitation',
  description: 'Accept invitation token',
  request: {
    params: z.object({
      token: z.string(),
    }),
    body: {
      content: {
        'application/json': {
          schema: acceptInviteJsonSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Invitation was accepted',
      content: {
        'application/json': {
          schema: successResponseWithoutDataSchema,
        },
      },
    },
    302: {
      description: 'Redirect to github',
      headers: z.object({
        Location: z.string(),
      }),
    },
    ...errorResponses,
  },
});

export const paddleWebhookRouteConfig = createRouteConfig({
  method: 'post',
  path: '/paddle-webhook',
  guard: isPublicAccess,
  tags: ['general'],
  summary: 'Paddle webhook',
  description: 'Paddle webhook for subscription events',
  request: {
    body: {
      content: {
        'application/json': {
          schema: z.unknown(),
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Paddle webhook received',
      content: {
        'application/json': {
          schema: successResponseWithoutDataSchema,
        },
      },
    },
    ...errorResponses,
  },
});

export const suggestionsConfig = createRouteConfig({
  method: 'get',
  path: '/suggestions',
  guard: isAuthenticated,
  tags: ['general'],
  summary: 'Get search suggestions',
  description: 'Get search suggestions for all entities, such as users and organizations.',
  request: {
    query: z.object({
      q: z.string().optional(),
      type: entityTypeSchema.optional(),
    }),
  },
  responses: {
    200: {
      description: 'Suggestions',
      content: {
        'application/json': {
          schema: successResponseWithDataSchema(suggestionsSchema),
        },
      },
    },
    ...errorResponses,
  },
});

export const getMembersRouteConfig = createRouteConfig({
  method: 'get',
  path: '/members',
  guard: [isAuthenticated, isAllowedTo('read', 'organization')],
  tags: ['general'],
  summary: 'Get list of members',
  description: 'Get members of an entity by id or slug. It returns members (users) with their role.',
  request: {
    query: getMembersQuerySchema,
  },
  responses: {
    200: {
      description: 'Members',
      content: {
        'application/json': {
          schema: successResponseWithPaginationSchema(apiMemberSchema),
        },
      },
    },
    ...errorResponses,
  },
});
