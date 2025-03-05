import { z } from '@hono/zod-openapi';
import { createRouteConfig } from '#/lib/route-config';
import { hasSystemAccess, isAuthenticated, isPublicAccess } from '#/middlewares/guard';
import { tokenLimiter } from '#/middlewares/rate-limiter/limiters';
import { booleanQuerySchema } from '#/utils/schema/common';
import { errorResponses, successWithoutDataSchema } from '#/utils/schema/responses';
import { inviteBodySchema, sendNewsletterBodySchema } from './schema';

class SystemRouteConfig {
  public createInvite = createRouteConfig({
    method: 'post',
    path: '/invite',
    guard: [isAuthenticated, hasSystemAccess],
    tags: ['system'],
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

  public sendNewsletter = createRouteConfig({
    method: 'post',
    path: '/newsletter',
    guard: [isAuthenticated, hasSystemAccess],
    tags: ['system'],
    summary: 'Newsletter for members',
    description: 'Send a newsletter to requested organizations members.',
    request: {
      query: z.object({ toSelf: booleanQuerySchema }),
      body: {
        required: true,
        content: {
          'application/json': {
            schema: sendNewsletterBodySchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Organization',
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
    middleware: [tokenLimiter('paddle')],
    tags: ['system'],
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
}
export default new SystemRouteConfig();
