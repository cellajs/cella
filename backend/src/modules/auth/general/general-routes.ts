import { z } from '@hono/zod-openapi';
import { createXRoutes, errors, json, jsonBody, xRoute } from '#/core/x-routes';
import { publicGuard, userGuard } from '#/middlewares/guard';
import { isNoBot } from '#/middlewares/is-no-bot';
import { emailEnumLimiter, spamLimiter, tokenLimiter } from '#/middlewares/rate-limiter/limiters';
import { mockTokenDataResponse } from '#/modules/auth/auth-mocks';
import { authHealthSchema, emailBodySchema, tokenWithDataSchema } from '#/modules/auth/general/general-schema';
import { heldLinkKinds, linkTokenKinds } from '#/modules/auth/tokens/token-policies';
import { locationSchema, maxLength, validIdSchema, validUuidSchema } from '#/schemas';
import { channelBaseSchema } from '#/schemas/entity-base';

export const authGeneralRoutes = createXRoutes(['auth', 'cella'], {
  health: xRoute({
    operationId: 'getAuthHealth',
    method: 'get',
    path: '/health',
    xGuard: [publicGuard],
    summary: 'Auth health check',
    description: 'Returns auth health status including whether the client IP is rate-limited for email enumeration protection.',
    responses: { 200: json('Auth health status', authHealthSchema) },
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
    responses: {
      200: json(
        'Browser recognition\n\nWhether this browser signed in to the account with this address before, by its device cookie.',
        z.object({ recognized: z.boolean() }),
      ),
    },
  }),
  getPendingMfa: xRoute({
    method: 'get',
    path: '/pending-mfa',
    xGuard: [publicGuard],
    summary: 'Get pending MFA challenge',
    description:
      'For the MFA challenge a sign-in left in this browser: the address of the account it completes, so the MFA page can name it in any browser.',
    responses: {
      200: json('Pending sign-in address\n\nThe address of the account the held MFA challenge signs in to.', z.object({ email: z.string() })),
      ...errors(401),
    },
  }),
  invokeToken: xRoute({
    method: 'get',
    path: '/invoke-token/{kind}/{token}',
    xGuard: [publicGuard],
    xRateLimiter: [tokenLimiter('token')],
    middleware: isNoBot,
    summary: 'Invoke token session',
    description:
      'Opens an emailed link of a link-carried token kind and redirects to the app. A magic link signs in, in the browser that asked for it. An invitation or a provider address verification is held in this browser for its confirm page, which redeems it (`redeemLinkToken`), so a mail scanner that fetches the link uses up nothing; one this browser redeemed before goes on at once.',
    request: { params: z.object({ kind: z.enum(linkTokenKinds), token: z.string().max(maxLength.field) }) },
    responses: { 302: { description: 'Redirect to the app', headers: locationSchema }, ...errors(401, 403, 404, 409) },
  }),
  redeemLinkToken: xRoute({
    method: 'post',
    path: '/invoke-token/{kind}',
    xGuard: [publicGuard],
    xRateLimiter: [tokenLimiter('token')],
    middleware: isNoBot,
    summary: 'Redeem held link',
    description:
      'Redeems the invitation or address verification link this browser holds, confirmed on the page opening it led to, and hands the browser a single-use token session in a cookie. Answers where the browser goes next, which the page navigates to: the app for an invitation, the provider for a verification.',
    request: { params: z.object({ kind: z.enum(heldLinkKinds) }) },
    responses: {
      200: json(
        'Link redeemed\n\nWhere the browser goes next: the app with the token session, or the provider for a verification.',
        z.object({ redirectTo: z.string() }),
      ),
      ...errors(401, 409),
    },
  }),
  getTokenData: xRoute({
    method: 'get',
    path: '/token/{kind}/{id}',
    xGuard: [publicGuard],
    xRateLimiter: [tokenLimiter('token')],
    middleware: isNoBot,
    summary: 'Get token data',
    description:
      'Gets basic data of the token held in the single-use token session: its address, the sender of an invitation and, for a membership invitation, what it grants. It answers only while the session is valid.',
    request: { params: z.object({ kind: z.enum(linkTokenKinds), id: validIdSchema }) },
    responses: { 200: json('Token is valid', tokenWithDataSchema, mockTokenDataResponse()), ...errors(401) },
  }),
  acceptInvitationToken: xRoute({
    method: 'post',
    path: '/accept-invitation-token',
    xGuard: [userGuard],
    xRateLimiter: [tokenLimiter('token')],
    middleware: isNoBot,
    summary: 'Accept invitation token as current user',
    description:
      'Accepts the membership invitation held in the single-use token session as the signed-in user, who must hold the invited address. An account on another address first confirms it (`confirmInvitationAddress`); until then the answer is 403 `invitation_address_unproven`. An account without a proven address accepts none (403 `anonymous_account`). Only an invitation not yet bound to another user can be accepted this way.',
    responses: { 200: json('Invitation was accepted', channelBaseSchema), ...errors(404, 409) },
  }),
  confirmInvitationAddress: xRoute({
    method: 'post',
    path: '/confirm-invitation-address',
    xGuard: [userGuard],
    xRateLimiter: [spamLimiter],
    middleware: isNoBot,
    summary: 'Confirm the invited address',
    description:
      'Mails the address the invitation in the single-use token session went to a new link, bound to the signed-in account. The new link replaces the older ones; opened from that inbox, it lets the account accept, and the address stays off the account. An account without a proven address binds none (403 `anonymous_account`).',
    responses: {
      204: {
        description:
          'Confirmation link sent\n\nA new link, bound to the signed-in account, went to the invited address. Every older link stops working.',
      },
      ...errors(404, 409),
    },
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
    responses: {
      204: {
        description:
          'Accepted\n\nAn email goes out only when the id names a pending invitation. The answer is the same either way, so it tells nobody which invitations exist.',
      },
    },
  }),
  signOut: xRoute({
    method: 'post',
    path: '/sign-out',
    xGuard: [publicGuard],
    summary: 'Sign out',
    description: 'Signs out the current user: the session is revoked (its row stays for the sessions list) and the cookie is cleared.',
    responses: { 204: { description: 'User signed out' }, ...errors(401) },
  }),
});
