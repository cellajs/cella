import { createXRoute } from '#/core/x-routes';
import { publicGuard } from '#/middlewares/guard';
import { isNoBot } from '#/middlewares/is-no-bot';
import { magicLinkLimiter, spamLimiter } from '#/middlewares/rate-limiter/limiters';
import { magicLinkBodySchema } from '#/modules/auth/magic/magic-schema';
import { errorResponseRefs } from '#/schemas';

const authMagicLinkRoutes = {
  /**
   * Send magic link email
   */
  sendMagicLink: createXRoute({
    operationId: 'sendMagicLink',
    method: 'post',
    path: '/magic/send',
    xGuard: [publicGuard],
    xRateLimiter: [magicLinkLimiter, spamLimiter],
    middleware: isNoBot,
    tags: ['auth', 'cella'],
    summary: 'Send magic link',
    description:
      'Sends a magic link sign-in email to the specified address. Always returns 204 to prevent email enumeration.',
    request: {
      body: {
        required: true,
        content: { 'application/json': { schema: magicLinkBodySchema } },
      },
    },
    responses: {
      204: { description: 'Magic link email sent (or silently ignored if email not found)' },
      ...errorResponseRefs,
    },
  }),
};

export { authMagicLinkRoutes };
