import { OpenAPIHono } from '@hono/zod-openapi';
import { eq } from 'drizzle-orm';
import { appConfig } from 'shared';
import type { Env } from '#/core/context';
import { AppError, type ErrorKey } from '#/core/error';
import { baseDb } from '#/db/db';
import { checkIpRateLimitStatus } from '#/middlewares/rate-limiter/helpers';
import { emailEnumLimiter } from '#/middlewares/rate-limiter/limiters';
import { authGeneralRoutes } from '#/modules/auth/general/general-routes';
import { deleteAuthCookie, getAuthCookie } from '#/modules/auth/general/helpers/cookie';
import { endSessions } from '#/modules/auth/general/helpers/end-sessions';
import { handleMagicLink } from '#/modules/auth/general/helpers/handle-magic';
import { isRecognizedBrowser } from '#/modules/auth/general/helpers/recognized-browser';
import { resendInvitationEmail } from '#/modules/auth/general/helpers/resend-invitation';
import { sendAccountSecurityEmail } from '#/modules/auth/general/helpers/send-account-security-email';
import { readSession, setUserSession } from '#/modules/auth/general/helpers/session';
import { acceptInvitationTokenOp } from '#/modules/auth/general/operations/accept-invitation-token';
import { getTokenDataOp } from '#/modules/auth/general/operations/get-token-data';
import { holdMagicLinkOutsideItsBrowser } from '#/modules/auth/magic/helpers/magic-link-browser';
import { claimMagicLinkOwner } from '#/modules/auth/magic/helpers/magic-sign-up';
import { handleOAuthVerification } from '#/modules/auth/oauth/helpers/handle-oauth-verification';
import { sessionsTable } from '#/modules/auth/sessions-db';
import { invokeToken, readBoundToken, spendCookieToken } from '#/modules/auth/tokens/token-lifecycle';
import { findInvitationToken } from '#/modules/auth/tokens/tokens-queries';
import { findUserById } from '#/modules/user/user-queries';
import { defaultHook } from '#/utils/default-hook';
import { log } from '#/utils/logger';

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

  try {
    if (tokenType === 'magic') {
      const held = await holdMagicLinkOutsideItsBrowser(ctx, token);
      if (held) return held;
    }

    // A sign-up link creates its account at this click, which proves the inbox.
    const claimOwner = tokenType === 'magic' ? claimMagicLinkOwner : undefined;
    const tokenRecord = await invokeToken(ctx, { type: tokenType, rawToken: token, claimOwner });

    if (tokenRecord.type === 'magic') return handleMagicLink(ctx, tokenRecord);

    if (tokenRecord.type === 'oauth-verification') return handleOAuthVerification(ctx, tokenRecord);

    // Only invitation remains: the param schema is limited to invokable types.
    const redirectUrl = `${appConfig.frontendUrl}/auth/authenticate?tokenId=${tokenRecord.id}`;

    log.info('Token invoked, redirecting with single use token in cookie', {
      tokenId: tokenRecord.id,
      userId: tokenRecord.userId,
    });

    return ctx.redirect(redirectUrl, 302);
  } catch (err) {
    if (err instanceof AppError) {
      throw new AppError(err.status, err.type as ErrorKey, err.severity, {
        willRedirect: appConfig.mode !== 'test',
        meta: { ...err.meta, errorPagePath: '/auth/error' },
      });
    }
    throw err;
  }
});

app.openapi(authGeneralRoutes.getTokenData, async (ctx) => {
  const { type: tokenType, id: tokenId } = ctx.req.valid('param');

  const tokenRecord = await readBoundToken(ctx, tokenType);
  if (tokenRecord.id !== tokenId) throw new AppError(400, 'invalid_request', 'warn');

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

  // An impersonation is layered on the admin's own session, never on another impersonation.
  if (ctx.var.session.type === 'impersonation') throw new AppError(400, 'invalid_request', 'warn');

  const user = await findUserById(ctx, { id: targetUserId });

  if (!user) throw new AppError(404, 'not_found', 'warn', { entityType: 'user', meta: { targetUserId } });

  const adminUser = ctx.var.user;
  await setUserSession(ctx, user, 'passkey', 'impersonation');

  log.info('Started impersonation', { adminId: adminUser.id, targetUserId });
  sendAccountSecurityEmail(user, 'impersonation-started', { adminName: adminUser.name || adminUser.email });

  return ctx.body(null, 204);
});

app.openapi(authGeneralRoutes.stopImpersonation, async (ctx) => {
  // userGuard read an impersonation only from its own cookie, on top of the admin session this browser holds.
  const { session } = ctx.var;
  if (session.type !== 'impersonation' || !session.impersonatorSessionId) {
    throw new AppError(400, 'invalid_request', 'warn');
  }

  const [admin] = await baseDb
    .select({ userId: sessionsTable.userId })
    .from(sessionsTable)
    .where(eq(sessionsTable.id, session.impersonatorSessionId));
  if (!admin) throw new AppError(401, 'unauthorized', 'warn');

  await endSessions(ctx, {
    userId: session.userId,
    sessionIds: [session.id],
    reason: 'impersonation_stopped',
    by: admin.userId,
  });

  // The admin's session cookie never left this browser: without the impersonation cookie it authenticates again.
  deleteAuthCookie(ctx, 'impersonation');

  log.info('Stopped impersonation', { adminId: admin.userId, targetUserId: session.userId });

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
  // A second-factor challenge this browser holds ends too: its cookie goes and its token row is spent.
  if (await getAuthCookie(ctx, 'confirm-mfa')) {
    await spendCookieToken(ctx, 'confirm-mfa');
    log.info('User mfa canceled');

    // Canceling from the MFA page carries no session cookie: ending the challenge is then the whole sign-out.
    if (!(await getAuthCookie(ctx, 'session'))) return ctx.body(null, 204);
  }

  // The browser's session cookie goes, and an impersonation cookie layered on it.
  const sessionToken = await getAuthCookie(ctx, 'session');
  deleteAuthCookie(ctx, 'session');
  if (await getAuthCookie(ctx, 'impersonation')) deleteAuthCookie(ctx, 'impersonation');
  if (!sessionToken) throw new AppError(401, 'unauthorized', 'warn');

  const { session: currentSession } = await readSession(sessionToken);
  if (currentSession.type === 'impersonation') throw new AppError(401, 'unauthorized', 'warn');

  await endSessions(ctx, {
    userId: currentSession.userId,
    sessionIds: [currentSession.id],
    reason: 'sign_out',
    by: currentSession.userId,
  });
  log.info('User signed out', { userId: currentSession.userId });

  return ctx.body(null, 204);
});

export const authGeneralHandlers = app;
