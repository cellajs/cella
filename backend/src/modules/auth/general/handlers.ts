import { OpenAPIHono } from '@hono/zod-openapi';
import { appConfig } from 'config';
import { and, desc, eq, isNotNull, isNull } from 'drizzle-orm';
import { db } from '#/db/db';
import { emailsTable } from '#/db/schema/emails';
import { organizationsTable } from '#/db/schema/organizations';
import { sessionsTable } from '#/db/schema/sessions';
import { tokensTable } from '#/db/schema/tokens';
import { usersTable } from '#/db/schema/users';
import { type Env, getContextUser } from '#/lib/context';
import { AppError } from '#/lib/errors';
import { deleteAuthCookie, getAuthCookie, setAuthCookie } from '#/modules/auth/helpers/cookie';
import { handleEmailVerification } from '#/modules/auth/helpers/handle-email-verification';
import { getParsedSessionCookie, setUserSession, validateSession } from '#/modules/auth/helpers/session';
import { usersBaseQuery } from '#/modules/users/helpers/select';
import { defaultHook } from '#/utils/default-hook';
import { getValidToken } from '#/utils/get-valid-token';
import { isExpiredDate } from '#/utils/is-expired-date';
import { logEvent } from '#/utils/logger';
import { TimeSpan } from '#/utils/time-span';
import { handleOAuthVerification } from '../helpers/handle-oauth-verification';
import authGeneralRoutes from './routes';

const app = new OpenAPIHono<Env>({ defaultHook });

const authGeneralRouteHandlers = app
  /*
   * Check if email exists
   */
  .openapi(authGeneralRoutes.checkEmail, async (ctx) => {
    const { email } = ctx.req.valid('json');

    const normalizedEmail = email.toLowerCase().trim();

    // If entering while having an unclaimed invitation token, abort and resend that invitation instead to prevent conflicts later
    const [inviteToken] = await db
      .select()
      .from(tokensTable)
      .where(
        and(
          eq(tokensTable.email, normalizedEmail),
          eq(tokensTable.type, 'invitation'),
          isNull(tokensTable.userId),
          isNotNull(tokensTable.entityType),
          isNotNull(tokensTable.role),
          isNull(tokensTable.invokedAt),
        ),
      )
      .limit(1);

    if (inviteToken) throw new AppError({ status: 403, type: 'invite_takes_priority', severity: 'warn' });

    // User not found, go to sign up if registration is enabled
    const [user] = await usersBaseQuery()
      .leftJoin(emailsTable, eq(usersTable.id, emailsTable.userId))
      .where(eq(emailsTable.email, normalizedEmail))
      .limit(1);

    if (!user) throw new AppError({ status: 404, type: 'not_found', severity: 'warn', entityType: 'user' });

    return ctx.json(true, 200);
  })
  /*
   * Consume token and redirect with single use session token in cookie
   */
  .openapi(authGeneralRoutes.consumeToken, async (ctx) => {
    const { token } = ctx.req.valid('param');

    // Check if token exists and create a new refresh token
    const tokenRecord = await getValidToken({ token, consumeToken: true });
    if (!tokenRecord.singleUseToken) throw new AppError({ status: 500, type: 'invalid_token', severity: 'error', isRedirect: true });

    // Set cookie using token type as name. Content is single use token. Expires in 10 minutes or until used.
    await setAuthCookie(ctx, tokenRecord.type, tokenRecord.singleUseToken, new TimeSpan(10, 'm'));

    // If verification email, we process it immediately and redirect to app
    if (tokenRecord.type === 'email_verification') return handleEmailVerification(ctx, tokenRecord);

    // If oauth verification, we redirect to oauth /verify route to complete verification though oauth provider
    if (tokenRecord.type === 'oauth_verification') return handleOAuthVerification(ctx, tokenRecord);

    // Determine redirect URL based on token type
    let redirectUrl = appConfig.defaultRedirectPath;
    if (tokenRecord.type === 'invitation') redirectUrl = `${appConfig.frontendUrl}/home?invitationTokenId=${tokenRecord.id}&skipWelcome=true`;
    if (tokenRecord.type === 'password_reset') redirectUrl = `${appConfig.frontendUrl}/auth/create-password/${tokenRecord.id}`;

    logEvent('info', 'Token consumed, redirecting with single use token in cookie', { tokenId: tokenRecord.id, userId: tokenRecord.userId });

    return ctx.redirect(redirectUrl, 302);
  })
  /*
   * Check token by id (without consuming it)
   */
  // TODO simplify?
  .openapi(authGeneralRoutes.getTokenData, async (ctx) => {
    // Find token in request
    const { tokenId } = ctx.req.valid('param');
    const { type: tokenType } = ctx.req.valid('query');

    // Get token
    const [tokenRecord] = await db
      .select()
      .from(tokensTable)
      .where(and(eq(tokensTable.id, tokenId), eq(tokensTable.type, tokenType)));
    if (!tokenRecord) throw new AppError({ status: 404, type: 'token_not_found', severity: 'error' });

    const baseData = {
      email: tokenRecord.email,
      role: tokenRecord.role,
      userId: tokenRecord.userId || '',
    };

    // If its NOT an organization invitation, return base data
    if (!tokenRecord.organizationId) return ctx.json(baseData, 200);

    // If it is a membership invitation, check if a new user has been created since invitation was sent (without verifying email)
    const [existingUser] = await usersBaseQuery().where(eq(usersTable.email, tokenRecord.email));
    if (!tokenRecord.userId && existingUser) {
      await db.update(tokensTable).set({ userId: existingUser.id }).where(eq(tokensTable.id, tokenRecord.id));
      baseData.userId = existingUser.id;
    }

    // Add organization data to base data
    const [organization] = await db.select().from(organizationsTable).where(eq(organizationsTable.id, tokenRecord.organizationId));
    if (!organization) throw new AppError({ status: 404, type: 'not_found', severity: 'warn', entityType: 'organization' });

    const dataWithOrg = {
      ...baseData,
      organizationId: organization.id || '',
      organizationName: organization.name || '',
      organizationSlug: organization.slug || '',
    };

    return ctx.json(dataWithOrg, 200);
  })
  /*
   * Start impersonation
   */
  .openapi(authGeneralRoutes.startImpersonation, async (ctx) => {
    const { targetUserId } = ctx.req.valid('query');

    const [user] = await usersBaseQuery().where(eq(usersTable.id, targetUserId)).limit(1);

    if (!user) throw new AppError({ status: 404, type: 'not_found', severity: 'warn', entityType: 'user', meta: { targetUserId } });

    const adminUser = getContextUser();
    await setUserSession(ctx, user, 'password', 'impersonation');

    logEvent('info', 'Started impersonation', { adminId: adminUser.id, targetUserId });

    return ctx.json(true, 200);
  })
  /*
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

    return ctx.json(true, 200);
  })
  /*
   * Sign out
   */
  .openapi(authGeneralRoutes.signOut, async (ctx) => {
    const confirmMfa = await getAuthCookie(ctx, 'confirm_mfa');

    if (confirmMfa) {
      // Delete mfa cookie
      deleteAuthCookie(ctx, 'confirm_mfa');

      logEvent('info', 'User mfa canceled');

      return ctx.json(true, 200);
    }

    // Find session & invalidate
    const { sessionToken } = await getParsedSessionCookie(ctx, { deleteOnError: true, deleteAfterAttempt: true });
    const { session: currentSession } = await validateSession(sessionToken);

    await db.delete(sessionsTable).where(and(eq(sessionsTable.id, currentSession.id), eq(sessionsTable.userId, currentSession.userId)));

    logEvent('info', 'User signed out', { userId: currentSession.userId });

    return ctx.json(true, 200);
  });

export default authGeneralRouteHandlers;
