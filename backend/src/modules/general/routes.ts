import { z } from '@hono/zod-openapi';
import { createRouteConfig } from '#/lib/route-config';
import { isAuthenticated, isPublicAccess, systemGuard } from '#/middlewares/guard';
import { authRateLimiter, rateLimiter } from '#/middlewares/rate-limiter';
import { errorResponses, successWithDataSchema, successWithoutDataSchema } from '#/utils/schema/common-responses';
import { pageEntityTypeSchema, slugSchema, tokenSchema } from '#/utils/schema/common-schemas';
import { userUnsubscribeQuerySchema } from '../users/schema';
import { acceptInviteBodySchema, checkTokenSchema, inviteBodySchema, suggestionsSchema } from './schema';

class GeneralRoutesConfig {
  public unsubscribeUser = createRouteConfig({
    method: 'get',
    path: '/unsubscribe',
    guard: isPublicAccess,
    tags: ['users'],
    summary: 'Unsubscribe',
    description: 'Unsubscribe using a personal unsubscribe token.',
    request: {
      query: userUnsubscribeQuerySchema,
    },
    responses: {
      302: {
        description: 'Redirect to FE',
        headers: z.object({ Location: z.string() }),
      },
      ...errorResponses,
    },
  });

  public getUploadToken = createRouteConfig({
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
            schema: successWithDataSchema(z.string()),
          },
        },
      },
      ...errorResponses,
    },
  });

  public checkSlug = createRouteConfig({
    method: 'post',
    path: '/check-slug',
    guard: isAuthenticated,
    tags: ['general'],
    summary: 'Check if slug is available',
    description: 'This endpoint is used to check if a slug is available among ALL contextual entities such as organizations.',
    request: {
      body: {
        content: {
          'application/json': {
            schema: z.object({
              slug: slugSchema,
            }),
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Slug is available',
        content: {
          'application/json': {
            schema: successWithoutDataSchema,
          },
        },
      },
      ...errorResponses,
    },
  });

  public checkToken = createRouteConfig({
    method: 'post',
    path: '/check-token',
    middleware: [authRateLimiter],
    guard: isPublicAccess,
    tags: ['general'],
    summary: 'Token validation check',
    description:
      'This endpoint is used to check if a token is still valid. It is used to provide direct user feedback on the validity of tokens such as reset password and invitation.',
    request: {
      body: {
        content: {
          'application/json': {
            schema: tokenSchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Token is valid',
        content: {
          'application/json': {
            schema: successWithDataSchema(checkTokenSchema),
          },
        },
      },
      ...errorResponses,
    },
  });

  public createInvite = createRouteConfig({
    method: 'post',
    path: '/invite',
    guard: [isAuthenticated, systemGuard],
    middleware: [rateLimiter({ points: 10, duration: 60 * 60, blockDuration: 60 * 10, keyPrefix: 'invite_success' }, 'success')],
    tags: ['general'],
    summary: 'Invite to system',
    description: 'Invite one or more users to system by email address.',
    request: {
      body: {
        content: {
          'application/json': {
            schema: inviteBodySchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Invitations are sent',
        content: {
          'application/json': {
            schema: successWithoutDataSchema,
          },
        },
      },
      ...errorResponses,
    },
  });

  public acceptInvite = createRouteConfig({
    method: 'post',
    path: '/invite/{token}',
    guard: isPublicAccess,
    middleware: [authRateLimiter],
    tags: ['general'],
    summary: 'Accept invitation',
    description: 'Accept invitation token',
    request: {
      params: tokenSchema,
      body: {
        content: {
          'application/json': {
            schema: acceptInviteBodySchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Invitation was accepted',
        content: {
          'application/json': {
            schema: successWithoutDataSchema,
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

  public paddleWebhook = createRouteConfig({
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
            schema: successWithoutDataSchema,
          },
        },
      },
      ...errorResponses,
    },
  });

  public getSuggestionsConfig = createRouteConfig({
    method: 'get',
    path: '/suggestions',
    guard: isAuthenticated,
    tags: ['general'],
    summary: 'Get list of suggestions',
    description: 'Get search suggestions for page entities such as users and organizations. It returns suggestions to which the user has access.',
    request: {
      query: z.object({
        q: z.string().optional(),
        type: pageEntityTypeSchema.optional(),
      }),
    },
    responses: {
      200: {
        description: 'Suggestions',
        content: {
          'application/json': {
            schema: successWithDataSchema(suggestionsSchema),
          },
        },
      },
      ...errorResponses,
    },
  });
}
export default new GeneralRoutesConfig();
