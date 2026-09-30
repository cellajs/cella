import { z } from '@hono/zod-openapi';
import { createXRoutes, json, jsonBody, xRoute } from '#/core/x-routes';
import { publicGuard } from '#/middlewares/guard';
import { isNoBot } from '#/middlewares/is-no-bot';
import { magicLinkLimiter, spamLimiter, tokenLimiter } from '#/middlewares/rate-limiter/limiters';
import { magicLinkBodySchema } from '#/modules/auth/magic/magic-schema';
import { locationSchema } from '#/schemas';

const authMagicLinkRoutes = createXRoutes(['auth', 'cella'], {
  sendMagicLink: xRoute({
    'x-strategy': 'magic',
    method: 'post',
    path: '/magic/send',
    xGuard: [publicGuard],
    xRateLimiter: [magicLinkLimiter, spamLimiter],
    middleware: isNoBot,
    summary: 'Send magic link',
    description:
      'Sends a magic link sign-in email to the specified address. Always returns 204 to prevent email enumeration.',
    request: { body: jsonBody(magicLinkBodySchema) },
    responses: { 204: { description: 'Magic link email sent (or silently ignored if email not found)' } },
  }),
  getPendingMagicLink: xRoute({
    'x-strategy': 'magic',
    method: 'get',
    path: '/magic/pending',
    xGuard: [publicGuard],
    xRateLimiter: [tokenLimiter('magic')],
    summary: 'Get pending magic link',
    description:
      'For a magic link opened in a browser that did not request it: the address it signs in, so the holder can recognize the account before confirming.',
    responses: {
      200: json(
        'The full address the held link signs in, as the confirm page shows it',
        z.object({ email: z.string() }),
      ),
    },
  }),
  confirmMagicLink: xRoute({
    'x-strategy': 'magic',
    method: 'post',
    path: '/magic/confirm',
    xGuard: [publicGuard],
    xRateLimiter: [tokenLimiter('magic')],
    summary: 'Confirm magic link',
    description:
      'Signs in with the magic link this browser holds, confirmed from the app page. A form post from the app origin; redirects like opening the link.',
    responses: { 302: { description: 'Signed in, redirect to the app', headers: locationSchema } },
  }),
});

export { authMagicLinkRoutes };
