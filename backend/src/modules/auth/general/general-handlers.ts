import { OpenAPIHono } from '@hono/zod-openapi';
import { appConfig } from 'shared';
import type { Env } from '#/core/context';
import { AppError, type ErrorKey } from '#/core/error';
import { checkIpRateLimitStatus } from '#/middlewares/rate-limiter/helpers';
import { emailEnumLimiter } from '#/middlewares/rate-limiter/limiters';
import { findLatestSessionByUser } from '#/modules/auth/auth-queries';
import { authGeneralRoutes } from '#/modules/auth/general/general-routes';
import { getAuthCookie, setAuthCookie } from '#/modules/auth/general/helpers/cookie';
import { endSessions } from '#/modules/auth/general/helpers/end-sessions';
import { handleMagicLink } from '#/modules/auth/general/helpers/handle-magic';
import { resendInvitationEmail } from '#/modules/auth/general/helpers/resend-invitation';
import { sendAccountSecurityEmail } from '#/modules/auth/general/helpers/send-account-security-email';
import { getParsedSessionCookie, setUserSession, validateSession } from '#/modules/auth/general/helpers/session';
import { acceptInvitationTokenOp } from '#/modules/auth/general/operations/accept-invitation-token';
import { getTokenDataOp } from '#/modules/auth/general/operations/get-token-data';
import { holdMagicLinkOutsideItsBrowser } from '#/modules/auth/magic/helpers/magic-link-browser';
import { handleOAuthVerification } from '#/modules/auth/oauth/helpers/handle-oauth-verification';
import { invokeToken, readBoundToken, spendCookieToken } from '#/modules/auth/tokens/token-lifecycle';
import { findInvitationToken } from '#/modules/auth/tokens/tokens-queries';
import { findUserByEmail, findUserById } from '#/modules/user/user-queries';
import { defaultHook } from '#/utils/default-hook';
import { isExpiredDate } from '#/utils/is-expired-date';
import { log } from '#/utils/logger';
import { TimeSpan } from '#/utils/time-span';

const app = new OpenAPIHono<Env>({ defaultHook });

app.openapi(authGeneralRoutes.health, async (ctx) => {
  // Check emailEnum rate limit status without consuming points
  const { isLimited, retryAfter } = await checkIpRateLimitStatus(ctx, emailEnumLimiter);

  return ctx.json({ restrictedMode: isLimited, ...(retryAfter && { retryAfter }) }, 200);
});

app.openapi(authGeneralRoutes.checkEmail, async (ctx) => {
  const { email } = ctx.req.valid('json');

  const { isLimited: restrictedMode } = await checkIpRateLimitStatus(ctx, emailEnumLimiter);

  // In restricted mode, always return 204 to prevent email enumeration
  if (restrictedMode) return ctx.body(null, 204);

  const normalizedEmail = email.toLowerCase().trim();

  const user = await findUserByEmail(ctx, { email: normalizedEmail });

  if (!user) throw new AppError(404, 'not_found', 'warn', { entityType: 'user' });

  return ctx.body(null, 204);
});

app.openapi(authGeneralRoutes.invokeToken, async (ctx) => {
  const { token, type: tokenType } = ctx.req.valid('param');

  try {
    if (tokenType === 'magic') {
      const held = await holdMagicLinkOutsideItsBrowser(ctx, token);
      if (held) return held;
    }

    const tokenRecord = await invokeToken(ctx, { type: tokenType, rawToken: token });

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

  const user = await findUserById(ctx, { id: targetUserId });

  if (!user) throw new AppError(404, 'not_found', 'warn', { entityType: 'user', meta: { targetUserId } });

  const adminUser = ctx.var.user;
  await setUserSession(ctx, user, 'passkey', 'impersonation');

  log.info('Started impersonation', { adminId: adminUser.id, targetUserId });
  sendAccountSecurityEmail(user, 'impersonation-started', { adminName: adminUser.name || adminUser.email });

  return ctx.body(null, 204);
});

app.openapi(authGeneralRoutes.stopImpersonation, async (ctx) => {
  const { sessionToken, adminUserId } = await getParsedSessionCookie(ctx, { deleteAfterAttempt: true });
  const { session } = await validateSession(sessionToken);

  // Only an impersonation session stops: it ends here, and the browser returns to the admin's own session.
  if (!adminUserId || session.type !== 'impersonation') throw new AppError(400, 'invalid_request', 'error');

  await endSessions(ctx, {
    userId: session.userId,
    sessionIds: [session.id],
    reason: 'impersonation_stopped',
    by: adminUserId,
  });

  const adminsLastSession = await findLatestSessionByUser(ctx, { userId: adminUserId });

  if (!adminsLastSession || isExpiredDate(adminsLastSession.expiresAt)) {
    throw new AppError(401, 'unauthorized', 'warn');
  }

  const expireTimeSpan = new TimeSpan(new Date(adminsLastSession.expiresAt).getTime() - Date.now(), 'ms');
  const cookieContent = `${adminsLastSession.secret}.${adminsLastSession.userId ?? ''}`;

  await setAuthCookie(ctx, 'session', cookieContent, expireTimeSpan);

  log.info('Stopped impersonation', { adminId: adminUserId, targetUserId: session.userId });

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

  const { sessionToken } = await getParsedSessionCookie(ctx, { deleteOnError: true, deleteAfterAttempt: true });
  const { session: currentSession } = await validateSession(sessionToken);

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
