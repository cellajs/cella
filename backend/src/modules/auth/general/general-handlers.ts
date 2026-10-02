import { OpenAPIHono } from '@hono/zod-openapi';
import type { Env } from '#/core/context';
import { AppError } from '#/core/error';
import { checkIpRateLimitStatus } from '#/middlewares/rate-limiter/helpers';
import { emailEnumLimiter } from '#/middlewares/rate-limiter/limiters';
import { isRecognizedBrowser } from '#/modules/auth/devices/operations/recognized-browser';
import { authGeneralRoutes } from '#/modules/auth/general/general-routes';
import { resendInvitationEmail } from '#/modules/auth/general/helpers/resend-invitation';
import { acceptInvitationTokenOp } from '#/modules/auth/general/operations/accept-invitation-token';
import { getTokenDataOp } from '#/modules/auth/general/operations/get-token-data';
import { startImpersonationOp, stopImpersonationOp } from '#/modules/auth/sessions/operations/impersonation';
import { signOutOp } from '#/modules/auth/sessions/operations/sign-out';
import '#/modules/auth/sessions/session-listeners';
import { openLinkToken } from '#/modules/auth/tokens/operations/open-link-token';
import { readBoundToken, spendCookieToken } from '#/modules/auth/tokens/token-lifecycle';
import { findInvitationToken } from '#/modules/auth/tokens/tokens-queries';
import { defaultHook } from '#/utils/default-hook';

const app = new OpenAPIHono<Env>({ defaultHook });

app.openapi(authGeneralRoutes.health, async (ctx) => {
  // Check emailEnum rate limit status without consuming points
  const { isLimited, retryAfter } = await checkIpRateLimitStatus(ctx, emailEnumLimiter);

  return ctx.json({ restrictedMode: isLimited, ...(retryAfter && { retryAfter }) }, 200);
});

app.openapi(authGeneralRoutes.checkEmail, async (ctx) => {
  const { email } = ctx.req.valid('json');

  // True only for a browser that signed in to the address before; any other browser gets false, account or not.
  const recognized = await isRecognizedBrowser(ctx, email.toLowerCase().trim());

  return ctx.json({ recognized }, 200);
});

app.openapi(authGeneralRoutes.invokeToken, async (ctx) => {
  const { token, type: tokenType } = ctx.req.valid('param');
  return openLinkToken(ctx, tokenType, token);
});

app.openapi(authGeneralRoutes.getTokenData, async (ctx) => {
  const { type: tokenType, id: tokenId } = ctx.req.valid('param');

  const tokenRecord = await readBoundToken(ctx, tokenType);
  // The browser holds a token of this type, not the one the URL names: the same answer as holding none.
  if (tokenRecord.id !== tokenId) throw new AppError(401, `${tokenType}_not_found`, 'warn');

  return ctx.json(await getTokenDataOp(ctx, tokenRecord), 200);
});

app.openapi(authGeneralRoutes.acceptInvitationToken, async (ctx) => {
  const tokenRecord = await readBoundToken(ctx, 'invitation');

  // The answer deletes the invitation's tokens; the spend also clears this browser's cookie.
  const entity = await acceptInvitationTokenOp(ctx, tokenRecord);
  await spendCookieToken(ctx, 'invitation');

  return ctx.json(entity, 200);
});

app.openapi(authGeneralRoutes.startImpersonation, async (ctx) => {
  const { targetUserId } = ctx.req.valid('json');
  await startImpersonationOp(ctx, { targetUserId });
  return ctx.body(null, 204);
});

app.openapi(authGeneralRoutes.stopImpersonation, async (ctx) => {
  await stopImpersonationOp(ctx);
  return ctx.body(null, 204);
});

app.openapi(authGeneralRoutes.resendInvitationWithToken, async (ctx) => {
  const { tokenId } = ctx.req.valid('json');

  // One answer whether the id names a pending invitation or not, so the route tells nobody which invitations exist.
  const oldToken = await findInvitationToken(ctx, { id: tokenId });
  if (oldToken) await resendInvitationEmail(ctx, oldToken);

  return ctx.body(null, 204);
});

app.openapi(authGeneralRoutes.signOut, async (ctx) => {
  await signOutOp(ctx);
  return ctx.body(null, 204);
});

export const authGeneralHandlers = app;
