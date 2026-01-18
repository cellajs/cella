import { z } from '@hono/zod-openapi';
import { createXRoute } from '#/docs/x-routes';
import { isPublicAccess } from '#/middlewares/guard';
import { webhookAckSchema } from '#/modules/webhooks/webhooks-schema';
import { idSchema } from '#/utils/schema/common';
import { errorResponseRefs } from '#/utils/schema/error-responses';

const webhooksRoutes = {
  /**
   * Receive GitHub webhook events
   * This endpoint is unauthenticated but uses webhook signature verification.
   */
  receiveGithubWebhook: createXRoute({
    operationId: 'receiveGithubWebhook',
    method: 'post',
    path: '/github/{repositoryId}',
    xGuard: isPublicAccess, // No auth required - uses webhook signature
    tags: ['webhooks'],
    summary: 'Receive GitHub webhook',
    description:
      'Receives webhook events from GitHub for automated deployments. Verifies signature using the repository webhook secret.',
    request: {
      params: z.object({
        repositoryId: idSchema,
      }),
      body: {
        required: true,
        content: {
          'application/json': {
            schema: z.record(z.string(), z.unknown()), // Accept any JSON payload
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Webhook received and processed',
        content: {
          'application/json': {
            schema: webhookAckSchema,
          },
        },
      },
      ...errorResponseRefs,
    },
  }),
};

export default webhooksRoutes;
