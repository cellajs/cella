import { z } from '@hono/zod-openapi';
import { createXRoutes, json, jsonBody, xRoute } from '#/core/x-routes';
import { publicGuard } from '#/middlewares/guard';
import { isNoBot } from '#/middlewares/is-no-bot';
import { magicLinkLimiter, spamLimiter, tokenLimiter } from '#/middlewares/rate-limiter/limiters';
import { magicLinkBodySchema } from '#/modules/auth/magic/magic-schema';
import { locationSchema } from '#/schemas';

const authMagicLinkRoutes = createXRoutes(['auth', 'cella'], {
  sendMagicLink: xRoute({
    method: 'post',
    path: '/magic/send',
    xEnabledBy: { strategy: 'magic' },
    xGuard: [publicGuard],
    xRateLimiter: [magicLinkLimiter, spamLimiter],
    middleware: isNoBot,
    summary: 'Send magic link',
    description:
      "Sends a magic link sign-in email to the specified address. Returns 204 whether or not the address has an account. An account whose organization requires its institution's sign-in gets a mail pointing there; only a browser that signed in to that account gets 403 `sso_required` instead.",
    request: { body: jsonBody(magicLinkBodySchema) },
    responses: { 204: { description: 'Accepted alike whether a link, a pointer to the institution or nothing was mailed' } },
  }),
  getPendingMagicLink: xRoute({
    method: 'get',
    path: '/magic/pending',
    xEnabledBy: { strategy: 'magic' },
    xGuard: [publicGuard],
    xRateLimiter: [tokenLimiter('magic')],
    summary: 'Get pending magic link',
    description:
      'For a magic link opened in a browser that did not request it: the address it signs in, so the holder can recognize the account before confirming.',
    responses: { 200: json('The full address the held link signs in, as the confirm page shows it', z.object({ email: z.string() })) },
  }),
  confirmMagicLink: xRoute({
    method: 'post',
    path: '/magic/confirm',
    xEnabledBy: { strategy: 'magic' },
    xGuard: [publicGuard],
    xRateLimiter: [tokenLimiter('magic')],
    summary: 'Confirm magic link',
    description:
      'Signs in with the magic link this browser holds, confirmed from the app page. A form post from the app origin; redirects like opening the link.',
    responses: { 302: { description: 'Signed in, redirect to the app', headers: locationSchema } },
  }),
});

export { authMagicLinkRoutes };
