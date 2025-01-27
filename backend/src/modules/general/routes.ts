import { z } from '@hono/zod-openapi';
import { createRouteConfig } from '#/lib/route-config';
import { isAuthenticated, isPublicAccess, systemGuard } from '#/middlewares/guard';
import { tokenLimiter } from '#/middlewares/rate-limiter';
import { errorResponses, successWithDataSchema, successWithoutDataSchema } from '#/utils/schema/common-responses';
import { contextEntityTypeSchema, idSchema, pageEntityTypeSchema, slugSchema } from '#/utils/schema/common-schemas';
import { userUnsubscribeQuerySchema } from '../users/schema';
import { entitySuggestionSchema, inviteBodySchema, suggestionsSchema } from './schema';

class GeneralRoutesConfig {
  public unsubscribeUser = createRouteConfig({
    method: 'get',
    path: '/unsubscribe',
    guard: isPublicAccess,
    middleware: [tokenLimiter],
    tags: ['general'],
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

  public createInvite = createRouteConfig({
    method: 'post',
    path: '/invite',
    guard: [isAuthenticated, systemGuard],
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

  public paddleWebhook = createRouteConfig({
    method: 'post',
    path: '/paddle-webhook',
    guard: isPublicAccess,
    middleware: [tokenLimiter],
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
      query: z.object({ q: z.string().optional(), type: pageEntityTypeSchema.optional() }),
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
  public getInviteSuggestionsConfig = createRouteConfig({
    method: 'get',
    path: '/invite-suggestions',
    guard: isAuthenticated,
    tags: ['general'],
    summary: 'Get list of user suggestions for invite',
    description: 'Get search suggestions for user invitations. It returns distinct users with whom you share memberships.',
    request: {
      query: z.object({ q: z.string().optional(), entityId: idSchema, entityType: contextEntityTypeSchema }),
    },
    responses: {
      200: {
        description: 'Invite Suggestions',
        content: {
          'application/json': {
            schema: successWithDataSchema(
              entitySuggestionSchema
                .omit({ membership: true, email: true, thumbnailUrl: true })
                .extend({ email: z.string(), thumbnailUrl: z.string().nullable() })
                .array(),
            ),
          },
        },
      },
      ...errorResponses,
    },
  });
}
export default new GeneralRoutesConfig();
