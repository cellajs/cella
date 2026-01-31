import { z } from '@hono/zod-openapi';
import { createXRoute } from '#/docs/x-routes';
import { hasSystemAccess, isAuthenticated, isPublicAccess } from '#/middlewares/guard';
import { presignedUrlLimiter, tokenLimiter } from '#/middlewares/rate-limiter/limiters';
import { inviteBodySchema, preasignedURLQuerySchema, sendNewsletterBodySchema } from '#/modules/system/system-schema';
import { booleanTransformSchema, errorResponseRefs, successWithRejectedItemsSchema } from '#/schemas';
import { mockPresignedUrlResponse, mockSystemInviteResponse } from '../../../mocks/mock-system';

const systemRoutes = {
  /**
   * Invite to system
   */
  createInvite: createXRoute({
    operationId: 'systemInvite',
    method: 'post',
    path: '/invite',
    xGuard: [isAuthenticated, hasSystemAccess],
    tags: ['system'],
    summary: 'Invite to system',
    description:
      'Invites one or more users to the system via email. Can be used to onboard system level users or admins.',
    request: {
      body: {
        required: true,
        content: { 'application/json': { schema: inviteBodySchema } },
      },
    },
    responses: {
      200: {
        description: 'Invitations are sent',
        content: {
          'application/json': {
            schema: successWithRejectedItemsSchema.extend({ invitesSentCount: z.number() }),
            example: mockSystemInviteResponse(),
          },
        },
      },
      ...errorResponseRefs,
    },
  }),
  /**
   * Send newsletter to members
   */
  sendNewsletter: createXRoute({
    operationId: 'sendNewsletter',
    method: 'post',
    path: '/newsletter',
    xGuard: [isAuthenticated, hasSystemAccess],
    tags: ['system'],
    summary: 'Newsletter to members',
    description: 'Sends a newsletter to members of one or more specified organizations.',
    request: {
      query: z.object({ toSelf: booleanTransformSchema }),
      body: {
        required: true,
        content: { 'application/json': { schema: sendNewsletterBodySchema } },
      },
    },
    responses: {
      204: {
        description: 'Newsletter sent',
      },
      ...errorResponseRefs,
    },
  }),
  /**
   * Get presigned URL
   */
  getPresignedUrl: createXRoute({
    operationId: 'getPresignedUrl',
    method: 'get',
    path: '/presigned-url',
    xGuard: isPublicAccess,
    xRateLimiter: presignedUrlLimiter,
    tags: ['system'],
    summary: 'Get presigned URL',
    description: 'Generates and returns a presigned URL for uploading files to an S3 bucket.',
    request: { query: preasignedURLQuerySchema },
    responses: {
      200: {
        description: 'Presigned URL',
        content: { 'application/json': { schema: z.string(), example: mockPresignedUrlResponse() } },
      },
      ...errorResponseRefs,
    },
  }),
  /**
   * Paddle webhook (WIP)
   */
  paddleWebhook: createXRoute({
    operationId: 'paddleWebhook',
    method: 'post',
    path: '/paddle-webhook',
    xGuard: isPublicAccess,
    xRateLimiter: tokenLimiter('paddle'),
    tags: ['system'],
    summary: 'Paddle webhook (WIP)',
    description: 'Receives and handles Paddle subscription events such as purchases, renewals, and cancellations.',
    request: {
      body: { content: { 'application/json': { schema: z.unknown() } } },
    },
    responses: {
      204: {
        description: 'Paddle webhook received',
      },
      ...errorResponseRefs,
    },
  }),
};
export default systemRoutes;
