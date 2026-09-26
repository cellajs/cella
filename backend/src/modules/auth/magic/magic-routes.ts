import { z } from '@hono/zod-openapi';
import { createXRoute } from '#/core/x-routes';
import { publicGuard } from '#/middlewares/guard';
import { isNoBot } from '#/middlewares/is-no-bot';
import { magicLinkLimiter, spamLimiter, tokenLimiter } from '#/middlewares/rate-limiter/limiters';
import { magicLinkBodySchema } from '#/modules/auth/magic/magic-schema';
import { errorResponseRefs, locationSchema } from '#/schemas';

const authMagicLinkRoutes = {
  sendMagicLink: createXRoute({
    operationId: 'sendMagicLink',
    'x-strategy': 'magic',
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
  getPendingMagicLink: createXRoute({
    operationId: 'getPendingMagicLink',
    'x-strategy': 'magic',
    method: 'get',
    path: '/magic/pending',
    xGuard: [publicGuard],
    xRateLimiter: [tokenLimiter('magic')],
    tags: ['auth', 'cella'],
    summary: 'Get pending magic link',
    description:
      'For a magic link opened in a browser that did not request it: the address it signs in, so the holder can recognize the account before confirming.',
    responses: {
      200: {
        description: 'Masked address of the held link',
        content: { 'application/json': { schema: z.object({ email: z.string() }) } },
      },
      ...errorResponseRefs,
    },
  }),
  confirmMagicLink: createXRoute({
    operationId: 'confirmMagicLink',
    'x-strategy': 'magic',
    method: 'post',
    path: '/magic/confirm',
    xGuard: [publicGuard],
    xRateLimiter: [tokenLimiter('magic')],
    tags: ['auth', 'cella'],
    summary: 'Confirm magic link',
    description:
      'Signs in with the magic link this browser holds, confirmed from the app page. A form post from the app origin; redirects like opening the link.',
    responses: {
      302: { description: 'Signed in, redirect to the app', headers: locationSchema },
      ...errorResponseRefs,
    },
  }),
};

export { authMagicLinkRoutes };
