import { z } from '@hono/zod-openapi';
import { createCustomRoute } from '#/lib/custom-routes';
import { hasSystemAccess, isAuthenticated, isPublicAccess } from '#/middlewares/guard';
import { presignedUrlLimiter, tokenLimiter } from '#/middlewares/rate-limiter/limiters';
import { inviteBodySchema, preasignedURLQuerySchema, sendNewsletterBodySchema } from '#/modules/system/schema';
import { booleanTransformSchema } from '#/utils/schema/common';
import { errorResponseRefs } from '#/utils/schema/error-responses';
import { successWithRejectedItemsSchema } from '#/utils/schema/success-responses';

const systemRoutes = {
  createInvite: createCustomRoute({
    operationId: 'systemInvite',
    method: 'post',
    path: '/invite',
    guard: [isAuthenticated, hasSystemAccess],
    tags: ['system'],
    summary: 'Invite to system',
    description: 'Invites one or more users to the system via email. Can be used to onboard system level users or admins.',
    request: {
      body: {
        required: true,
        content: { 'application/json': { schema: inviteBodySchema } },
      },
    },
    responses: {
      200: {
        description: 'Invitations are sent',
        content: { 'application/json': { schema: successWithRejectedItemsSchema.extend({ invitesSentCount: z.number() }) } },
      },
      ...errorResponseRefs,
    },
  }),

  sendNewsletter: createCustomRoute({
    operationId: 'sendNewsletter',
    method: 'post',
    path: '/newsletter',
    guard: [isAuthenticated, hasSystemAccess],
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

  getPresignedUrl: createCustomRoute({
    operationId: 'getPresignedUrl',
    method: 'get',
    path: '/presigned-url',
    guard: [isPublicAccess],
    middleware: [presignedUrlLimiter],
    tags: ['system'],
    summary: 'Get presigned URL',
    description: 'Generates and returns a presigned URL for uploading files to an S3 bucket.',
    request: { query: preasignedURLQuerySchema },
    responses: {
      200: {
        description: 'Presigned URL',
        content: { 'application/json': { schema: z.string() } },
      },
      ...errorResponseRefs,
    },
  }),

  paddleWebhook: createCustomRoute({
    operationId: 'paddleWebhook',
    method: 'post',
    path: '/paddle-webhook',
    guard: isPublicAccess,
    middleware: [tokenLimiter('paddle')],
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
