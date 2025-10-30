import { OpenAPIHono } from '@hono/zod-openapi';
import { appConfig } from 'config';
import { and, desc, eq } from 'drizzle-orm';
import i18n from 'i18next';
import { nanoid } from 'nanoid';
import { db } from '#/db/db';
import { emailsTable } from '#/db/schema/emails';
import { sessionsTable } from '#/db/schema/sessions';
import { tokensTable } from '#/db/schema/tokens';
import { usersTable } from '#/db/schema/users';
import { type Env, getContextUser } from '#/lib/context';
import { AppError } from '#/lib/errors';
import { mailer } from '#/lib/mailer';
import { deleteAuthCookie, getAuthCookie, setAuthCookie } from '#/modules/auth/general/helpers/cookie';
import { getParsedSessionCookie, setUserSession, validateSession } from '#/modules/auth/general/helpers/session';
import authGeneralRoutes from '#/modules/auth/general/routes';
import { handleOAuthVerification } from '#/modules/auth/oauth/helpers/handle-oauth-verification';
import { handleEmailVerification } from '#/modules/auth/passwords/helpers/handle-email-verification';
import { usersBaseQuery } from '#/modules/users/helpers/select';
import { defaultHook } from '#/utils/default-hook';
import { getValidSingleUseToken } from '#/utils/get-valid-single-use-token';
import { getValidToken } from '#/utils/get-valid-token';
import { isExpiredDate } from '#/utils/is-expired-date';
import { logEvent } from '#/utils/logger';
import { encodeLowerCased } from '#/utils/oslo';
import { slugFromEmail } from '#/utils/slug-from-email';
import { createDate, TimeSpan } from '#/utils/time-span';
import { MemberInviteWithTokenEmail, MemberInviteWithTokenEmailProps } from '../../../../emails/member-invite-with-token';
import { resolveEntity } from '#/lib/entity';
import { inactiveMembershipSchema } from '#/modules/memberships/schema';
import { inactiveMembershipsTable } from '#/db/schema/inactive-memberships';
import { SystemInviteEmail, SystemInviteEmailProps } from '../../../../emails/system-invite';

const app = new OpenAPIHono<Env>({ defaultHook });

const authGeneralRouteHandlers = app
  /**
   * Check if email exists
   */
  .openapi(authGeneralRoutes.checkEmail, async (ctx) => {
    const { email } = ctx.req.valid('json');

    const normalizedEmail = email.toLowerCase().trim();

    // User not found, go to sign up if registration is enabled
    const [user] = await usersBaseQuery()
      .leftJoin(emailsTable, eq(usersTable.id, emailsTable.userId))
      .where(eq(emailsTable.email, normalizedEmail))
      .limit(1);

    if (!user) throw new AppError({ status: 404, type: 'not_found', severity: 'warn', entityType: 'user' });

    return ctx.body(null, 204);
  })
  /**
   * Validate and invoke token by creating a single use session token in cookie
   */
  .openapi(authGeneralRoutes.invokeToken, async (ctx) => {
    const { token, type: tokenType } = ctx.req.valid('param');

    // Check if token exists and create a new single use token session
    const tokenRecord = await getValidToken({ ctx, token, tokenType, invokeToken: true, redirectPath: '/auth/error' });
    if (!tokenRecord.singleUseToken) throw new AppError({ status: 500, type: 'invalid_token', severity: 'error', redirectPath: '/auth/error' });

    // Set cookie using token type as name. Content is single use token. Expires in 5 minutes or until used.
    await setAuthCookie(ctx, tokenRecord.type, tokenRecord.singleUseToken, new TimeSpan(5, 'm'));

    // If verification email, we process it immediately and redirect to app
    if (tokenRecord.type === 'email-verification') return handleEmailVerification(ctx, tokenRecord);

    // If oauth verification, we redirect to oauth /verify route to complete verification though oauth provider
    if (tokenRecord.type === 'oauth-verification') return handleOAuthVerification(ctx, tokenRecord);

    // Determine redirect URL based on token type
    let redirectUrl = appConfig.defaultRedirectPath;

    // If invitation, redirect to auth page with tokenId param
    if (tokenRecord.type === 'invitation') redirectUrl = `${appConfig.frontendUrl}/auth/authenticate?tokenId=${tokenRecord.id}`;

    // If password reset, redirect to create password page with tokenId param
    if (tokenRecord.type === 'password-reset') redirectUrl = `${appConfig.frontendUrl}/auth/create-password/${tokenRecord.id}`;

    logEvent('info', 'Token invoked, redirecting with single use token in cookie', { tokenId: tokenRecord.id, userId: tokenRecord.userId });

    return ctx.redirect(redirectUrl, 302);
  })
  /**
   * Get token data by single use token in cookie
   */
  .openapi(authGeneralRoutes.getTokenData, async (ctx) => {
    const { type: tokenType, id: tokenId } = ctx.req.valid('param');

    // Check if token session is valid
    const tokenRecord = await getValidSingleUseToken({ ctx, tokenType });

    // Check if tokenId matches the one being requested
    if (tokenRecord.id !== tokenId) throw new AppError({ status: 400, type: 'invalid_request', severity: 'warn' });

    const data = {
      email: tokenRecord.email,
      userId: tokenRecord.userId || '',
      inactiveMembershipId: tokenRecord.inactiveMembershipId || '',
    };

    // If its NOT an membership invitation, return base data
    if (!tokenRecord.inactiveMembershipId) return ctx.json(data, 200);

    // If it is a membership invitation, check if a new user has been created since invitation was sent (without verifying email)
    const [existingUser] = await usersBaseQuery().where(eq(usersTable.email, tokenRecord.email));
    if (!tokenRecord.userId && existingUser) {
      await db.update(tokensTable).set({ userId: existingUser.id }).where(eq(tokensTable.id, tokenRecord.id));
      data.userId = existingUser.id;
    }

    return ctx.json(data, 200);
  })
  /**
   * Start impersonation
   */
  .openapi(authGeneralRoutes.startImpersonation, async (ctx) => {
    const { targetUserId } = ctx.req.valid('query');

    const [user] = await usersBaseQuery().where(eq(usersTable.id, targetUserId)).limit(1);

    if (!user) throw new AppError({ status: 404, type: 'not_found', severity: 'warn', entityType: 'user', meta: { targetUserId } });

    const adminUser = getContextUser();
    await setUserSession(ctx, user, 'password', 'impersonation');

    logEvent('info', 'Started impersonation', { adminId: adminUser.id, targetUserId });

    return ctx.body(null, 204);
  })
  /**
   * Stop impersonation
   */
  .openapi(authGeneralRoutes.stopImpersonation, async (ctx) => {
    const { sessionToken, adminUserId } = await getParsedSessionCookie(ctx, { deleteAfterAttempt: true });
    const { session } = await validateSession(sessionToken);

    // Only continue if session is impersonation
    if (!adminUserId) throw new AppError({ status: 400, type: 'invalid_request', severity: 'error' });

    const [adminsLastSession] = await db
      .select()
      .from(sessionsTable)
      .where(eq(sessionsTable.userId, adminUserId))
      .orderBy(desc(sessionsTable.expiresAt))
      .limit(1);

    if (isExpiredDate(adminsLastSession.expiresAt)) throw new AppError({ status: 401, type: 'unauthorized', severity: 'warn' });

    const expireTimeSpan = new TimeSpan(adminsLastSession.expiresAt.getTime() - Date.now(), 'ms');
    const cookieContent = `${adminsLastSession.token}.${adminsLastSession.userId ?? ''}`;

    await setAuthCookie(ctx, 'session', cookieContent, expireTimeSpan);

    logEvent('info', 'Stopped impersonation', { adminId: adminUserId || 'na', targetUserId: session.userId });

    return ctx.body(null, 204);
  })
  /**
   * Resend invitation email with token for entity invites and system invites.
   * TODO system invites not yet implemented, move entire sending email logic to helper
   */
  .openapi(authGeneralRoutes.resendInvitationWithToken, async (ctx) => {
    const { email, tokenId } = ctx.req.valid('json');

    const normalizedEmail = email?.toLowerCase().trim();

    const filters = [eq(tokensTable.type, 'invitation')];

    if (normalizedEmail) filters.push(eq(tokensTable.email, normalizedEmail));
    else if (tokenId) filters.push(eq(tokensTable.id, tokenId));
    else throw new AppError({ status: 400, type: 'invalid_request', severity: 'error' });

    // Retrieve token
    const [oldToken] = await db
      .select()
      .from(tokensTable)
      .where(and(...filters))
      .orderBy(desc(tokensTable.createdAt))
      .limit(1);

    if (!oldToken) throw new AppError({ status: 404, type: 'token_not_found', severity: 'error' });

    const { email: userEmail } = oldToken;

    // Generate token and store hashed
    const newToken = nanoid(40);
    const hashedToken = encodeLowerCased(newToken);

    // Insert token first
    await db.insert(tokensTable).values({
      ...oldToken,
      token: hashedToken,
      expiresAt: createDate(new TimeSpan(7, 'd')),
      invokedAt: null,
      singleUseToken: null,
    });

    // Prepare and send invitation email
    const recipient = {
      email: userEmail,
      name: slugFromEmail(userEmail),
      memberInviteLink: `${appConfig.backendAuthUrl}/invoke-token/${oldToken.type}/${newToken}`,
    };

    // Prepare email props, default is system invite
    const emailProps = {
      senderName: 'System',
      senderThumbnailUrl: null as string | null,
      subject: i18n.t('backend:email.system_invite.subject', {
        lng: appConfig.defaultLanguage,
      }),
      lng: appConfig.defaultLanguage,
    };

    // Get original sender
    if (oldToken.createdBy) {
      const [sender] = await usersBaseQuery().where(eq(usersTable.id, oldToken.createdBy)).limit(1);

      emailProps.senderName = sender.name;
      emailProps.senderThumbnailUrl = sender.thumbnailUrl;
    }

    // Get entity info
    if (oldToken.inactiveMembershipId) {
      const [inactiveMembership] = await db.select().from(inactiveMembershipsTable).where(eq(inactiveMembershipsTable.id, oldToken.inactiveMembershipId))

      await mailer.prepareEmails<MemberInviteWithTokenEmailProps, typeof recipient>(MemberInviteWithTokenEmail, emailProps, [recipient], userEmail);
      logEvent('info', 'Membership invitation has been resent', { [entityIdField]: entity.id });
    } else {
      await mailer.prepareEmails<SystemInviteEmailProps, typeof recipient>(SystemInviteEmail, emailProps, [recipient], userEmail);
      logEvent('info', 'System invitation has been resent');
    }

    return ctx.body(null, 204);
  })
  /**
   * Sign out
   */
  .openapi(authGeneralRoutes.signOut, async (ctx) => {
    const confirmMfa = await getAuthCookie(ctx, 'confirm-mfa');

    if (confirmMfa) {
      // Delete mfa cookie
      deleteAuthCookie(ctx, 'confirm-mfa');

      logEvent('info', 'User mfa canceled');

      return ctx.body(null, 204);
    }

    // Find session & invalidate
    const { sessionToken } = await getParsedSessionCookie(ctx, { deleteOnError: true, deleteAfterAttempt: true });
    const { session: currentSession } = await validateSession(sessionToken);

    await db.delete(sessionsTable).where(and(eq(sessionsTable.id, currentSession.id), eq(sessionsTable.userId, currentSession.userId)));

    logEvent('info', 'User signed out', { userId: currentSession.userId });

    return ctx.body(null, 204);
  });

export default authGeneralRouteHandlers;
