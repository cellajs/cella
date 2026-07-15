import { OpenAPIHono } from '@hono/zod-openapi';
import { eq } from 'drizzle-orm';
import { appConfig } from 'shared';
import { nanoid } from 'shared/utils/nanoid';
import type { Env } from '#/core/context';
import '#/modules/auth/auth-module';
import { AppError, type ErrorKey } from '#/core/error';
import { mailer } from '#/lib/mailer';
import { invalidateCache } from '#/middlewares/guard/invalidate-cache';
import { checkIpRateLimitStatus } from '#/middlewares/rate-limiter/helpers';
import { emailEnumLimiter } from '#/middlewares/rate-limiter/limiters';
import {
  deleteSession,
  findAuthUserById,
  findInactiveMembershipById,
  findInvitationToken,
  findLatestSessionByUser,
  findUserByEmail,
  insertInvitationToken,
  linkTokenToUser,
} from '#/modules/auth/auth-queries';
import { authGeneralRoutes } from '#/modules/auth/general/general-routes';
import { deleteAuthCookie, getAuthCookie, setAuthCookie } from '#/modules/auth/general/helpers/cookie';
import { handleEmailVerification } from '#/modules/auth/general/helpers/handle-email-verification';
import { handleMagicLink } from '#/modules/auth/general/helpers/handle-magic';
import { sendAccountSecurityEmail } from '#/modules/auth/general/helpers/send-account-security-email';
import { getParsedSessionCookie, setUserSession, validateSession } from '#/modules/auth/general/helpers/session';
import { handleOAuthVerification } from '#/modules/auth/oauth/helpers/handle-oauth-verification';
import { tokensTable } from '#/modules/auth/tokens-db';
import { resolveEntity } from '#/modules/entities/entities-queries';
import { defaultHook } from '#/utils/default-hook';
import { getValidSingleUseToken } from '#/utils/get-valid-single-use-token';
import { getValidToken } from '#/utils/get-valid-token';
import { isExpiredDate } from '#/utils/is-expired-date';
import { log } from '#/utils/logger';
import { encodeLowerCased } from '#/utils/oslo';
import { slugFromEmail } from '#/utils/slug-from-email';
import { createDate, TimeSpan } from '#/utils/time-span';
import { memberInviteWithTokenEmail, systemInviteEmail } from '../../../../emails';

const app = new OpenAPIHono<Env>({ defaultHook });

app.openapi(authGeneralRoutes.health, async (ctx) => {
  // Check emailEnum rate limit status without consuming points
  const { isLimited, retryAfter } = await checkIpRateLimitStatus(ctx, emailEnumLimiter);

  return ctx.json({ restrictedMode: isLimited, ...(retryAfter && { retryAfter }) }, 200);
});

app.openapi(authGeneralRoutes.checkEmail, async (ctx) => {
  const { email } = ctx.req.valid('json');

  // Check if IP is rate-limited for email enumeration (restricted mode)
  const { isLimited: restrictedMode } = await checkIpRateLimitStatus(ctx, emailEnumLimiter);

  // In restricted mode, always return 204 to prevent email enumeration
  if (restrictedMode) return ctx.body(null, 204);

  const normalizedEmail = email.toLowerCase().trim();

  // User not found, go to sign up if registration is enabled
  const user = await findUserByEmail(ctx, { email: normalizedEmail });

  if (!user) throw new AppError(404, 'not_found', 'warn', { entityType: 'user' });

  return ctx.body(null, 204);
});

app.openapi(authGeneralRoutes.invokeToken, async (ctx) => {
  const { token, type: tokenType } = ctx.req.valid('param');

  try {
    // Check if token exists and create a new single use token session
    const tokenRecord = await getValidToken({ ctx, token, tokenType, invokeToken: true });
    if (!tokenRecord.singleUseToken)
      throw new AppError(500, 'invalid_token', 'error', {
        willRedirect: appConfig.mode !== 'test',
        meta: { errorPagePath: '/auth/error' },
      });

    // Set cookie using token type as name. Content is single use token. Expires in 5 minutes or until used.
    await setAuthCookie(ctx, tokenRecord.type, tokenRecord.singleUseToken, new TimeSpan(5, 'm'));

    // If verification email, we process it immediately and redirect to app
    if (tokenRecord.type === 'email-verification') return handleEmailVerification(ctx, tokenRecord);

    // If magic link, authenticate user and redirect to app
    if (tokenRecord.type === 'magic') return handleMagicLink(ctx, tokenRecord);

    // If oauth verification, we redirect to oauth /verify route to complete verification though oauth provider
    if (tokenRecord.type === 'oauth-verification') return handleOAuthVerification(ctx, tokenRecord);

    // Determine redirect URL based on token type
    let redirectUrl = appConfig.defaultRedirectPath;

    // If invitation, redirect to auth page with tokenId param
    if (tokenRecord.type === 'invitation')
      redirectUrl = `${appConfig.frontendUrl}/auth/authenticate?tokenId=${tokenRecord.id}`;

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

  // Check if token session is valid
  const tokenRecord = await getValidSingleUseToken({ ctx, tokenType });

  // Check if tokenId matches the one being requested
  if (tokenRecord.id !== tokenId) throw new AppError(400, 'invalid_request', 'warn');

  const tokenResponse = {
    email: tokenRecord.email,
    userId: tokenRecord.userId || '',
    inactiveMembershipId: tokenRecord.inactiveMembershipId || '',
  };

  // If its NOT an membership invitation, return base data
  if (!tokenRecord.inactiveMembershipId) return ctx.json(tokenResponse, 200);

  // If it is a membership invitation, check if a new user has been created since invitation was sent (without verifying email)
  const existingUser = await findUserByEmail(ctx, { email: tokenRecord.email });
  if (!tokenRecord.userId && existingUser) {
    await linkTokenToUser(ctx, { tokenId: tokenRecord.id, userId: existingUser.id });
    tokenResponse.userId = existingUser.id;
  }

  return ctx.json(tokenResponse, 200);
});

app.openapi(authGeneralRoutes.startImpersonation, async (ctx) => {
  const { targetUserId } = ctx.req.valid('query');

  const user = await findAuthUserById(ctx, { userId: targetUserId });

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

  // Retrieve token
  const oldToken = await findInvitationToken(ctx, { filters });

  if (!oldToken) throw new AppError(404, 'token_not_found', 'error');

  const { email: userEmail } = oldToken;

  // Generate token and store hashed
  const newToken = nanoid(40);
  const hashedToken = encodeLowerCased(newToken);

  // Insert token first
  await insertInvitationToken(ctx, {
    values: {
      ...oldToken,
      secret: hashedToken,
      expiresAt: createDate(new TimeSpan(7, 'd')),
      invokedAt: null,
      singleUseToken: null,
    },
  });

  // Prepare and send invitation email
  const recipient = {
    email: userEmail,
    lng: appConfig.defaultLanguage,
    name: slugFromEmail(userEmail),
    inviteLink: `${appConfig.backendAuthUrl}/invoke-token/${oldToken.type}/${newToken}`,
  };

  // Prepare email props, default is system invite
  const defaultEmailProps = {
    senderName: 'System',
    senderThumbnailUrl: null as string | null,
  };

  // Get original sender
  if (oldToken.createdBy) {
    const sender = await findAuthUserById(ctx, { userId: oldToken.createdBy });
    if (sender) {
      defaultEmailProps.senderName = sender.name;
      defaultEmailProps.senderThumbnailUrl = sender.thumbnailUrl;
    }
  }

  // Get entity info
  if (oldToken.inactiveMembershipId) {
    const inactiveMembership = await findInactiveMembershipById(ctx, {
      id: oldToken.inactiveMembershipId,
    });

    const entityIdColumnKey = appConfig.entityIdColumnKeys[
      inactiveMembership.channelType
    ] as keyof typeof inactiveMembership;
    if (!inactiveMembership[entityIdColumnKey]) throw new AppError(400, 'invalid_request', 'error');
    // Internal resolve: getting entity info for email template (no permission check needed)
    const entity = await resolveEntity(
      ctx,
      inactiveMembership.channelType,
      inactiveMembership[entityIdColumnKey] as string,
    );

    if (!entity) throw new AppError(400, 'invalid_request', 'error');

    const emailProps = {
      ...defaultEmailProps,
      entityName: entity.name,
      role: inactiveMembership.role,
    };

    const recipientLng = 'defaultLanguage' in entity ? entity.defaultLanguage : appConfig.defaultLanguage;
    await mailer.prepareEmails(
      memberInviteWithTokenEmail,
      emailProps,
      [{ ...recipient, lng: recipientLng }],
      userEmail,
    );
    log.info('Membership invitation has been resent', { [entityIdColumnKey]: entity.id });
  } else {
    await mailer.prepareEmails(systemInviteEmail, defaultEmailProps, [recipient], userEmail);
    log.info('System invitation has been resent');
  }

  return ctx.body(null, 204);
});

app.openapi(authGeneralRoutes.signOut, async (ctx) => {
  const confirmMfa = await getAuthCookie(ctx, 'confirm-mfa');

  if (confirmMfa) {
    // Delete mfa cookie
    deleteAuthCookie(ctx, 'confirm-mfa');

    log.info('User mfa canceled');

    return ctx.body(null, 204);
  }

  // Find session & invalidate
  const { sessionToken } = await getParsedSessionCookie(ctx, { deleteOnError: true, deleteAfterAttempt: true });
  const { session: currentSession } = await validateSession(sessionToken);

  await deleteSession(ctx, { sessionId: currentSession.id, userId: currentSession.userId });

  invalidateCache.user(currentSession.userId);
  log.info('User signed out', { userId: currentSession.userId });

  return ctx.body(null, 204);
});

export const authGeneralHandlers = app;
