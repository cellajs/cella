import { OpenAPIHono } from '@hono/zod-openapi';
import { eq } from 'drizzle-orm';
import { appConfig } from 'shared';
import type { Env } from '#/core/context';
import { AppError, type ErrorKey } from '#/core/error';
import { invalidateCache } from '#/middlewares/guard/invalidate-cache';
import { checkIpRateLimitStatus } from '#/middlewares/rate-limiter/helpers';
import { emailEnumLimiter } from '#/middlewares/rate-limiter/limiters';
import {
  deleteSession,
  findInvitationToken,
  findLatestSessionByUser,
  linkTokenToUser,
} from '#/modules/auth/auth-queries';
import { authGeneralRoutes } from '#/modules/auth/general/general-routes';
import { deleteAuthCookie, getAuthCookie, setAuthCookie } from '#/modules/auth/general/helpers/cookie';
import { handleEmailVerification } from '#/modules/auth/general/helpers/handle-email-verification';
import { handleMagicLink } from '#/modules/auth/general/helpers/handle-magic';
import { resendInvitationEmail } from '#/modules/auth/general/helpers/resend-invitation';
import { sendAccountSecurityEmail } from '#/modules/auth/general/helpers/send-account-security-email';
import { getParsedSessionCookie, setUserSession, validateSession } from '#/modules/auth/general/helpers/session';
import { handleOAuthVerification } from '#/modules/auth/oauth/helpers/handle-oauth-verification';
import { tokensTable } from '#/modules/auth/tokens-db';
import { findUserByEmail, findUserById } from '#/modules/user/user-queries';
import { defaultHook } from '#/utils/default-hook';
import { getValidSingleUseToken } from '#/utils/get-valid-single-use-token';
import { getValidToken } from '#/utils/get-valid-token';
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
    const tokenRecord = await getValidToken({ ctx, token, tokenType, invokeToken: true });

    // A raw singleUseToken comes back only on a fresh mint (won the CAS); a tolerated re-click returns null and the 5-minute cookie stays valid.
    if (tokenRecord.singleUseToken) {
      // Cookie named by token type, holding the single use token, expiring in 5 minutes or on use.
      await setAuthCookie(ctx, tokenRecord.type, tokenRecord.singleUseToken, new TimeSpan(5, 'm'));
    }

    if (tokenRecord.type === 'email-verification') return handleEmailVerification(ctx, tokenRecord);

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

  const tokenRecord = await getValidSingleUseToken({ ctx, tokenType });

  if (tokenRecord.id !== tokenId) throw new AppError(400, 'invalid_request', 'warn');

  const tokenResponse = {
    email: tokenRecord.email,
    userId: tokenRecord.userId || '',
    inactiveMembershipId: tokenRecord.inactiveMembershipId || '',
  };

  if (!tokenRecord.inactiveMembershipId) return ctx.json(tokenResponse, 200);

  // Membership invitation: a user may have been created since the invite was sent, without verifying email
  const existingUser = await findUserByEmail(ctx, { email: tokenRecord.email });
  if (!tokenRecord.userId && existingUser) {
    await linkTokenToUser(ctx, { tokenId: tokenRecord.id, userId: existingUser.id });
    tokenResponse.userId = existingUser.id;
  }

  return ctx.json(tokenResponse, 200);
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

  // Only continue if session is impersonation
  if (!adminUserId) throw new AppError(400, 'invalid_request', 'error');

  const adminsLastSession = await findLatestSessionByUser(ctx, { userId: adminUserId });

  if (isExpiredDate(adminsLastSession.expiresAt)) throw new AppError(401, 'unauthorized', 'warn');

  const expireTimeSpan = new TimeSpan(new Date(adminsLastSession.expiresAt).getTime() - Date.now(), 'ms');
  const cookieContent = `${adminsLastSession.secret}.${adminsLastSession.userId ?? ''}`;

  await setAuthCookie(ctx, 'session', cookieContent, expireTimeSpan);

  log.info('Stopped impersonation', { adminId: adminUserId, targetUserId: session.userId });

  return ctx.body(null, 204);
});

app.openapi(authGeneralRoutes.resendInvitationWithToken, async (ctx) => {
  const { email, tokenId } = ctx.req.valid('json');

  const normalizedEmail = email?.toLowerCase().trim();

  const filters = [eq(tokensTable.type, 'invitation')];

  if (normalizedEmail) filters.push(eq(tokensTable.email, normalizedEmail));
  else if (tokenId) filters.push(eq(tokensTable.id, tokenId));
  else throw new AppError(400, 'invalid_request', 'error');

  const oldToken = await findInvitationToken(ctx, { filters });

  if (!oldToken) throw new AppError(404, 'token_not_found', 'error');

  await resendInvitationEmail(ctx, oldToken);

  return ctx.body(null, 204);
});

app.openapi(authGeneralRoutes.signOut, async (ctx) => {
  const confirmMfa = await getAuthCookie(ctx, 'confirm-mfa');

  if (confirmMfa) {
    deleteAuthCookie(ctx, 'confirm-mfa');

    log.info('User mfa canceled');

    return ctx.body(null, 204);
  }

  const { sessionToken } = await getParsedSessionCookie(ctx, { deleteOnError: true, deleteAfterAttempt: true });
  const { session: currentSession } = await validateSession(sessionToken);

  await deleteSession(ctx, { sessionId: currentSession.id, userId: currentSession.userId });

  invalidateCache.user(currentSession.userId);
  log.info('User signed out', { userId: currentSession.userId });

  return ctx.body(null, 204);
});

export const authGeneralHandlers = app;
