import { OpenAPIHono } from '@hono/zod-openapi';
import type { Env } from '#/core/context';
import { AppError } from '#/core/error';
import { mailer } from '#/lib/mailer';
import { checkIpRateLimitStatus } from '#/middlewares/rate-limiter/helpers';
import { emailEnumLimiter } from '#/middlewares/rate-limiter/limiters';
import { isRecognizedBrowser } from '#/modules/auth/core/devices/operations/recognized-browser';
import { listSignInFederations } from '#/modules/auth/core/federations/list-sign-in-federations';
import { authGeneralRoutes } from '#/modules/auth/core/general/general-routes';
import { acceptInvitationTokenOp } from '#/modules/auth/core/invitations/operations/accept-invitation-token';
import { confirmInvitationAddressOp } from '#/modules/auth/core/invitations/operations/confirm-invitation-address';
import { getTokenDataOp } from '#/modules/auth/core/invitations/operations/get-token-data';
import { resendInvitationByTokenOp } from '#/modules/auth/core/invitations/operations/resend-invitation';
import { signOutOp } from '#/modules/auth/core/sessions/operations/sign-out';
import '#/modules/auth/core/sessions/session-listeners';
import { confirmHeldLink, openLinkToken } from '#/modules/auth/core/tokens/operations/open-link-token';
import { readBoundToken, spendCookieToken } from '#/modules/auth/core/tokens/token-lifecycle';

const app = new OpenAPIHono<Env>();

app.openapi(authGeneralRoutes.health, async (ctx) => {
  // Check emailEnum rate limit status without consuming points
  const [{ isLimited, retryAfter }, federations] = await Promise.all([checkIpRateLimitStatus(ctx, emailEnumLimiter), listSignInFederations()]);

  return ctx.json({ restrictedMode: isLimited, ...(retryAfter && { retryAfter }), federations, emailEnabled: mailer.enabled }, 200);
});

app.openapi(authGeneralRoutes.checkEmail, async (ctx) => {
  const { email } = ctx.req.valid('json');

  // True only for a browser that signed in to the address before; any other browser gets false, account or not.
  const recognized = await isRecognizedBrowser(ctx, email);

  return ctx.json({ recognized }, 200);
});

app.openapi(authGeneralRoutes.getPendingMfa, async (ctx) => {
  // Reads only: the challenge stays open for its second factor.
  const { email } = await readBoundToken(ctx, 'confirm-mfa');
  return ctx.json({ email }, 200, { 'Cache-Control': 'no-store' });
});

app.openapi(authGeneralRoutes.invokeToken, (ctx) => {
  // The URL carries a single-use secret in its path, which `no-referrer` keeps out of a Referer.
  ctx.header('Referrer-Policy', 'no-referrer');
  const { token, kind } = ctx.req.valid('param');
  return openLinkToken(ctx, kind, token);
});

app.openapi(authGeneralRoutes.redeemLinkToken, async (ctx) => {
  const redirectUrl = await confirmHeldLink(ctx, ctx.req.valid('param').kind);
  return ctx.json({ redirectUrl }, 200);
});

app.openapi(authGeneralRoutes.getTokenData, async (ctx) => {
  const { kind, id: tokenId } = ctx.req.valid('param');

  const tokenRecord = await readBoundToken(ctx, kind);
  // The browser holds a token of this kind, not the one the URL names: the same answer as holding none.
  if (tokenRecord.id !== tokenId) throw new AppError(401, `${kind}_not_found`, 'warn');

  return ctx.json(await getTokenDataOp(ctx, tokenRecord), 200, { 'Cache-Control': 'no-store' });
});

app.openapi(authGeneralRoutes.acceptInvitationToken, async (ctx) => {
  const tokenRecord = await readBoundToken(ctx, 'invitation');

  // The answer deletes the invitation's tokens; the spend also clears this browser's cookie.
  const entity = await acceptInvitationTokenOp(ctx, tokenRecord);
  await spendCookieToken(ctx, 'invitation');

  return ctx.json(entity, 200);
});

app.openapi(authGeneralRoutes.confirmInvitationAddress, async (ctx) => {
  const tokenRecord = await readBoundToken(ctx, 'invitation');

  // The new link replaces this browser's token, whose cookie then names nothing.
  await confirmInvitationAddressOp(ctx, tokenRecord);

  return ctx.body(null, 204);
});

app.openapi(authGeneralRoutes.resendInvitationWithToken, async (ctx) => {
  const { tokenId } = ctx.req.valid('json');

  // One answer whether the id names a pending invitation or not, so the route tells nobody which invitations exist.
  await resendInvitationByTokenOp(ctx, tokenId);

  return ctx.body(null, 204);
});

app.openapi(authGeneralRoutes.signOut, async (ctx) => {
  await signOutOp(ctx);
  return ctx.body(null, 204);
});

export const authGeneralHandlers = app;
