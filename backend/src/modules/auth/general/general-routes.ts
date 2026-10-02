import { z } from '@hono/zod-openapi';
import { createXRoutes, json, jsonBody, xRoute } from '#/core/x-routes';
import { publicGuard, type StrategyGate, strategyEnabled, sysAdminGuard, userGuard } from '#/middlewares/guard';
import { isNoBot } from '#/middlewares/is-no-bot';
import { emailEnumLimiter, spamLimiter, tokenLimiter } from '#/middlewares/rate-limiter/limiters';
import { mockTokenDataResponse } from '#/modules/auth/auth-mocks';
import { emailBodySchema, invokableTokenTypes, tokenWithDataSchema } from '#/modules/auth/general/general-schema';
import { cookieSchema, locationSchema, validIdSchema, validUuidSchema } from '#/schemas';
import { channelBaseSchema } from '#/schemas/entity-base';
import { mockChannelBase } from '#/schemas/entity-base-mocks';

/** A magic link belongs to the magic-link method; the other invokable tokens (invitations, verification) to none. */
const magicLinkStrategy: StrategyGate = (ctx) => (ctx.req.param('type') === 'magic' ? 'magic' : null);

const authGeneralRoutes = createXRoutes(['auth', 'cella'], {
  health: xRoute({
    operationId: 'getAuthHealth',
    method: 'get',
    path: '/health',
    xGuard: [publicGuard],
    summary: 'Auth health check',
    description: 'Returns auth health status including whether the client IP is rate-limited for email enumeration protection.',
    responses: {
      200: json('Auth health status', z.object({ restrictedMode: z.boolean(), retryAfter: z.number().optional() })),
    },
  }),
  startImpersonation: xRoute({
    method: 'post',
    path: '/impersonation/start',
    xGuard: [userGuard, sysAdminGuard],
    summary: 'Start impersonating',
    description: 'Allows a system admin to impersonate a specific user by ID, returning a temporary impersonation session.',
    request: { body: jsonBody(z.object({ targetUserId: validIdSchema })) },
    responses: { 204: { description: 'Impersonating', headers: z.object({ 'Set-Cookie': cookieSchema }) } },
  }),
  stopImpersonation: xRoute({
    method: 'post',
    path: '/impersonation/stop',
    xGuard: [userGuard],
    summary: 'Stop impersonating',
    description: 'Ends impersonation by clearing the current impersonation session and restoring the admin context.',
    responses: { 204: { description: 'Stopped impersonating' } },
  }),
  checkEmail: xRoute({
    method: 'post',
    path: '/check-email',
    xGuard: [publicGuard],
    xRateLimiter: [emailEnumLimiter],
    middleware: isNoBot,
    summary: 'Check email',
    description:
      'Tells whether this browser has signed in to the account with this email address before, by its device cookie. Any other browser gets `recognized: false`, whether or not the address has an account.',
    request: { body: jsonBody(emailBodySchema) },
    responses: { 200: json('Whether this browser is recognized for the address', z.object({ recognized: z.boolean() })) },
  }),
  invokeToken: xRoute({
    method: 'get',
    path: '/invoke-token/{type}/{token}',
    xGuard: [strategyEnabled(magicLinkStrategy), publicGuard],
    xRateLimiter: [tokenLimiter('token')],
    middleware: isNoBot,
    summary: 'Invoke token session',
    description:
      "Opens an emailed link of a link-carried token type: a magic link or a provider address verification signs in, a step-up link proves presence on this browser's session, an invitation hands the app a single-use token session in a cookie. Redirects to the app.",
    request: { params: z.object({ type: z.enum(invokableTokenTypes), token: z.string() }) },
    responses: { 302: { description: 'Redirect with token session', headers: locationSchema } },
  }),
  getTokenData: xRoute({
    method: 'get',
    path: '/token/{type}/{id}',
    xGuard: [publicGuard],
    xRateLimiter: [tokenLimiter('token')],
    middleware: isNoBot,
    summary: 'Get token data',
    description: 'Get basic token data from single-use token session, It returns basic data if the session is still valid.',
    request: { params: z.object({ type: z.enum(invokableTokenTypes), id: validIdSchema }) },
    responses: { 200: json('Token is valid', tokenWithDataSchema, mockTokenDataResponse()) },
  }),
  acceptInvitationToken: xRoute({
    method: 'post',
    path: '/invitation-token/accept',
    xGuard: [userGuard],
    xRateLimiter: [tokenLimiter('token')],
    middleware: isNoBot,
    summary: 'Accept invitation token as current user',
    description:
      'Accepts the membership invitation held in the single-use token session as the signed-in user, also when it was sent to a different email address. Only an invitation not yet bound to another user can be accepted this way.',
    request: {},
    responses: { 200: json('Invitation was accepted', channelBaseSchema, mockChannelBase()) },
  }),
  resendInvitationWithToken: xRoute({
    method: 'post',
    path: '/resend-invitation',
    xGuard: [publicGuard],
    xRateLimiter: [spamLimiter],
    summary: 'Resend invitation',
    description:
      'Re-sends a pending invitation, named by the id of one of its tokens, to the address it went to. The fresh link replaces the older ones. Answers 204 whether or not an email went out.',
    request: { body: jsonBody(z.object({ tokenId: validUuidSchema })) },
    responses: { 204: { description: 'Invitation email sent when the invitation is pending' } },
  }),
  signOut: xRoute({
    method: 'post',
    path: '/sign-out',
    xGuard: [publicGuard],
    summary: 'Sign out',
    description: 'Signs out the current user: the session is revoked (its row stays for the sessions list) and the cookie is cleared.',
    responses: { 204: { description: 'User signed out' } },
  }),
});

export { authGeneralRoutes };
