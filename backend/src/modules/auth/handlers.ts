import { getRandomValues } from 'node:crypto';
import { OpenAPIHono } from '@hono/zod-openapi';
import { encodeBase64 } from '@oslojs/encoding';
import { generateCodeVerifier, generateState, OAuth2RequestError } from 'arctic';
import { config, type EnabledOauthProvider } from 'config';
import { and, desc, eq } from 'drizzle-orm';
import i18n from 'i18next';
import { db } from '#/db/db';
import { type EmailModel, emailsTable } from '#/db/schema/emails';
import { membershipsTable } from '#/db/schema/memberships';
import { organizationsTable } from '#/db/schema/organizations';
import { passkeysTable } from '#/db/schema/passkeys';
import { sessionsTable } from '#/db/schema/sessions';
import { tokensTable } from '#/db/schema/tokens';
import { type UserModel, usersTable } from '#/db/schema/users';
import { type Env, getContextToken, getContextUser } from '#/lib/context';
import { resolveEntity } from '#/lib/entity';
import { type ErrorType, errorRedirect, errorResponse } from '#/lib/errors';
import { eventManager } from '#/lib/events';
import { mailer } from '#/lib/mailer';
import { sendSSEToUsers } from '#/lib/sse';
import { logEvent } from '#/middlewares/logger/log-event';
import { hashPassword, verifyPasswordHash } from '#/modules/auth/helpers/argon2id';
import { deleteAuthCookie, getAuthCookie, setAuthCookie } from '#/modules/auth/helpers/cookie';
import {
  clearOauthSession,
  createOauthSession,
  getOauthCookies,
  handleOAuthConnection,
  handleOAuthInvitation,
  handleOAuthRedirect,
} from '#/modules/auth/helpers/oauth/cookies';
import { findExistingUsers, getOauthRedirectUrl, handleExistingUser } from '#/modules/auth/helpers/oauth/index';
import {
  type GithubUserEmailProps,
  type GithubUserProps,
  type GoogleUserProps,
  githubAuth,
  googleAuth,
  type MicrosoftUserProps,
  microsoftAuth,
} from '#/modules/auth/helpers/oauth/oauth-providers';
import { transformGithubUserData, transformSocialUserData } from '#/modules/auth/helpers/oauth/transform-user-data';
import { verifyPassKeyPublic } from '#/modules/auth/helpers/passkey';
import { getParsedSessionCookie, invalidateSessionById, setUserSession, validateSession } from '#/modules/auth/helpers/session';
import { handleCreateUser, handleMembershipTokenUpdate } from '#/modules/auth/helpers/user';
import { sendVerificationEmail } from '#/modules/auth/helpers/verify-email';
import authRoutes from '#/modules/auth/routes';
import { getUserBy } from '#/modules/users/helpers/get-user-by';
import { defaultHook } from '#/utils/default-hook';
import { isExpiredDate } from '#/utils/is-expired-date';
import { getIsoDate } from '#/utils/iso-date';
import { nanoid } from '#/utils/nanoid';
import { slugFromEmail } from '#/utils/slug-from-email';
import { createDate, TimeSpan } from '#/utils/time-span';
import { CreatePasswordEmail, type CreatePasswordEmailProps } from '../../../emails/create-password';
import { EmailVerificationEmail, type EmailVerificationEmailProps } from '../../../emails/email-verification';

const enabledStrategies: readonly string[] = config.enabledAuthStrategies;
const enabledOauthProviders: readonly string[] = config.enabledOauthProviders;

// Scopes for OAuth providers
const githubScopes = ['user:email'];
const googleScopes = ['profile', 'email'];
const microsoftScopes = ['profile', 'email'];

// Check if oauth provider is enabled by config
function isOAuthEnabled(provider: EnabledOauthProvider): boolean {
  if (!enabledStrategies.includes('oauth')) return false;
  return enabledOauthProviders.includes(provider);
}

const app = new OpenAPIHono<Env>({ defaultHook });

const authRouteHandlers = app
  /*
   * Check if email exists
   */
  .openapi(authRoutes.checkEmail, async (ctx) => {
    const { email } = ctx.req.valid('json');

    const user = await getUserBy('email', email.toLowerCase());
    if (!user) return errorResponse(ctx, 404, 'not_found', 'warn', 'user');

    return ctx.json(true, 200);
  })
  /*
   * Sign up with email & password.
   * Attention: sign up is also used for new users that received (system or membership) invitations.
   * Only for membership invitations, user will proceed to accept after signing up.
   */
  .openapi(authRoutes.signUp, async (ctx) => {
    const { email, password } = ctx.req.valid('json');

    // Verify if strategy allowed
    const strategy = 'password';
    if (!enabledStrategies.includes(strategy)) {
      return errorResponse(ctx, 400, 'forbidden_strategy', 'error', undefined, { strategy });
    }

    // Stop if sign up is disabled and no invitation
    if (!config.has.registrationEnabled) return errorResponse(ctx, 403, 'sign_up_restricted', 'info');

    const hashedPassword = await hashPassword(password);
    const slug = slugFromEmail(email);

    // Create user & send verification email
    const newUser = { slug, name: slug, email, hashedPassword };

    return await handleCreateUser({ ctx, newUser });
  })
  /*
   * Sign up with email & password to accept (system or membership) invitations.
   * Only for membership invitations, user will proceed to accept after signing up.
   */
  .openapi(authRoutes.signUpWithToken, async (ctx) => {
    const { password } = ctx.req.valid('json');
    const userId = nanoid();

    const validToken = getContextToken();
    if (!validToken) return errorResponse(ctx, 400, 'invalid_request', 'error');

    const membershipInvite = !!validToken.entityType;
    // Verify if strategy allowed
    const strategy = 'password';
    if (!enabledStrategies.includes(strategy)) {
      return errorResponse(ctx, 400, 'forbidden_strategy', 'error', undefined, { strategy });
    }

    // Delete token to not needed anymore (if no membership invitation)
    if (!membershipInvite) await db.delete(tokensTable).where(eq(tokensTable.id, validToken.id));

    // add token if it's membership invitation
    const membershipInviteTokenId = membershipInvite ? validToken.id : undefined;
    const hashedPassword = await hashPassword(password);
    const slug = slugFromEmail(validToken.email);

    // Create user & send verification email
    const newUser = { id: userId, slug, name: slug, email: validToken.email, hashedPassword };

    return await handleCreateUser({ ctx, newUser, membershipInviteTokenId, emailVerified: true });
  })
  /*
   * Send verification email, also used to resend verification email.
   */
  .openapi(authRoutes.sendVerificationEmail, async (ctx) => {
    const { userId, tokenId } = ctx.req.valid('json');

    let user: UserModel | null = null;

    // Get user
    if (userId) user = await getUserBy('id', userId);
    else if (tokenId) {
      const [tokenRecord] = await db.select().from(tokensTable).where(eq(tokensTable.id, tokenId));
      if (!tokenRecord || !tokenRecord.userId) return errorResponse(ctx, 404, 'not_found', 'warn');
      user = await getUserBy('id', tokenRecord.userId);
    }

    // Check if user exists
    if (!user) return errorResponse(ctx, 404, 'not_found', 'warn', 'user');

    const [emailInUse]: (EmailModel | undefined)[] = await db
      .select()
      .from(emailsTable)
      .where(and(eq(emailsTable.email, user.email), eq(emailsTable.verified, true)));

    if (emailInUse) return errorResponse(ctx, 409, 'email_exists', 'warn', 'user');

    // Delete previous
    await db.delete(tokensTable).where(and(eq(tokensTable.userId, user.id), eq(tokensTable.type, 'email_verification')));

    const token = nanoid(40);

    const [tokenRecord] = await db
      .insert(tokensTable)
      .values({
        token,
        type: 'email_verification',
        userId: user.id,
        email: user.email,
        createdBy: user.id,
        expiresAt: createDate(new TimeSpan(2, 'h')),
      })
      .returning();

    await db
      .insert(emailsTable)
      .values({ email: user.email, userId: user.id, tokenId: tokenRecord.id })
      .onConflictDoUpdate({
        target: emailsTable.email,
        where: eq(emailsTable.verified, false), // Only update if NOT verified
        set: {
          tokenId: tokenRecord.id,
          userId: user.id,
        },
      });

    // Send email
    const lng = user.language;
    const verificationLink = `${config.frontendUrl}/auth/verify-email/${token}?tokenId=${tokenRecord.id}`;
    const subject = i18n.t('backend:email.email_verification.subject', { lng, appName: config.name });
    const staticProps = { verificationLink, subject, lng };
    const recipients = [{ email: user.email }];

    type Recipient = { email: string };

    mailer.prepareEmails<EmailVerificationEmailProps, Recipient>(EmailVerificationEmail, staticProps, recipients);

    logEvent('Verification email sent', { user: user.id });

    return ctx.json(true, 200);
  })
  /*
   * Verify email
   */
  .openapi(authRoutes.verifyEmail, async (ctx) => {
    const token = getContextToken();
    if (!token || !token.userId) return errorResponse(ctx, 400, 'invalid_request', 'error');

    // Set email verified
    await db
      .update(emailsTable)
      .set({ verified: true, verifiedAt: getIsoDate() })
      .where(and(eq(emailsTable.tokenId, token.id), eq(emailsTable.userId, token.userId), eq(emailsTable.email, token.email)));

    // Delete token to prevent reuse
    await db.delete(tokensTable).where(eq(tokensTable.id, token.id));

    // Sign in user
    await setUserSession(ctx, token.userId, 'email');

    return ctx.json(true, 200);
  })
  /*
   * Request reset password email
   */
  .openapi(authRoutes.requestPassword, async (ctx) => {
    const { email } = ctx.req.valid('json');

    const user = await getUserBy('email', email.toLowerCase());
    if (!user) return errorResponse(ctx, 401, 'invalid_email', 'warn');

    // Delete old token if exists
    await db.delete(tokensTable).where(and(eq(tokensTable.userId, user.id), eq(tokensTable.type, 'password_reset')));

    const token = nanoid(40);

    const [tokenRecord] = await db
      .insert(tokensTable)
      .values({
        token,
        type: 'password_reset',
        userId: user.id,
        email,
        createdBy: user.id,
        expiresAt: createDate(new TimeSpan(2, 'h')),
      })
      .returning();

    // Send email
    const lng = user.language;
    const createPasswordLink = `${config.frontendUrl}/auth/create-password/${token}?tokenId=${tokenRecord.id}`;
    const subject = i18n.t('backend:email.create_password.subject', { lng, appName: config.name });
    const staticProps = { createPasswordLink, subject, lng };
    const recipients = [{ email: user.email }];

    type Recipient = { email: string };

    mailer.prepareEmails<CreatePasswordEmailProps, Recipient>(CreatePasswordEmail, staticProps, recipients);

    logEvent('Create password link sent', { user: user.id });

    return ctx.json(true, 200);
  })
  /*
   * Create password with token
   */
  .openapi(authRoutes.createPasswordWithToken, async (ctx) => {
    const { password } = ctx.req.valid('json');
    const token = getContextToken();

    // Verify if strategy allowed
    const strategy = 'password';
    if (!enabledStrategies.includes(strategy)) {
      return errorResponse(ctx, 400, 'forbidden_strategy', 'error', undefined, { strategy });
    }

    // If the token is not found or expired
    if (!token || !token.userId) return errorResponse(ctx, 401, 'invalid_token', 'warn');

    // Delete token to prevent reuse
    await db.delete(tokensTable).where(and(eq(tokensTable.id, token.id), eq(tokensTable.type, 'password_reset')));

    const user = await getUserBy('id', token.userId);

    // If the user is not found
    if (!user) return errorResponse(ctx, 404, 'not_found', 'warn', 'user', { userId: token.userId });

    // Hash password
    const hashedPassword = await hashPassword(password);

    // update user password and set email verified
    await Promise.all([
      db.update(usersTable).set({ hashedPassword }).where(eq(usersTable.id, user.id)),
      db.update(emailsTable).set({ verified: true, verifiedAt: getIsoDate() }).where(eq(emailsTable.email, user.email)),
    ]);

    // Sign in user
    await setUserSession(ctx, user.id, 'password');

    return ctx.json(true, 200);
  })
  /*
   * Sign in with email and password
   * Attention: sign in is also used to accept organization invitations (when signed out & user exists),
   * after signing in, we proceed to accept the invitation.
   */
  .openapi(authRoutes.signIn, async (ctx) => {
    const { email, password } = ctx.req.valid('json');

    // Verify if strategy allowed
    const strategy = 'password';
    if (!enabledStrategies.includes(strategy)) {
      return errorResponse(ctx, 400, 'forbidden_strategy', 'error', undefined, { strategy });
    }

    const loweredEmail = email.toLowerCase();

    const [user, [emailInfo]] = await Promise.all([
      getUserBy('email', loweredEmail, 'unsafe'),
      db.select().from(emailsTable).where(eq(emailsTable.email, loweredEmail)),
    ]);

    // If user is not found or doesn't have password
    if (!user) return errorResponse(ctx, 404, 'not_found', 'warn', 'user');
    if (!user.hashedPassword) return errorResponse(ctx, 403, 'no_password_found', 'warn');

    // Verify password
    const validPassword = await verifyPasswordHash(user.hashedPassword, password);
    if (!validPassword) return errorResponse(ctx, 403, 'invalid_password', 'warn');

    // If email is not verified, send verification email
    if (!emailInfo.verified) sendVerificationEmail(user.id);
    // Sign in user
    else await setUserSession(ctx, user.id, 'password');

    return ctx.json(emailInfo.verified, 200);
  })
  /*
   * Check token (token validation)
   */
  .openapi(authRoutes.checkToken, async (ctx) => {
    // Find token in request
    const { id } = ctx.req.valid('param');
    const { type } = ctx.req.valid('query');

    // Check if token exists
    const [tokenRecord] = await db.select().from(tokensTable).where(eq(tokensTable.id, id));
    if (!tokenRecord) return errorResponse(ctx, 404, `${type}_not_found`, 'warn');

    // If token is expired, return an error
    if (isExpiredDate(tokenRecord.expiresAt)) return errorResponse(ctx, 401, `${type}_expired`, 'warn', undefined);

    const baseData = {
      email: tokenRecord.email,
      role: tokenRecord.role,
      userId: tokenRecord.userId || '',
    };

    if (!tokenRecord.organizationId) return ctx.json(baseData, 200);

    // If it is a membership invitation, get organization details
    const [organization] = await db.select().from(organizationsTable).where(eq(organizationsTable.id, tokenRecord.organizationId));
    if (!organization) return errorResponse(ctx, 404, 'not_found', 'warn', 'organization');

    const dataWithOrg = {
      ...baseData,
      organizationId: organization.id || '',
      organizationName: organization.name || '',
      organizationSlug: organization.slug || '',
    };

    return ctx.json(dataWithOrg, 200);
  })
  /*
   * Accept org invite token for signed in users
   */
  .openapi(authRoutes.acceptEntityInvite, async (ctx) => {
    const user = getContextUser();
    const token = getContextToken();

    // Make sure its an organization invitation
    if (!token.entityType) return errorResponse(ctx, 401, 'invalid_token', 'warn');

    const [emailInfo] = await db.select().from(emailsTable).where(eq(emailsTable.email, token.email));
    // Make sure correct user accepts invitation (for example another user could have a sessions and click on email invite of another user)
    if (user.id !== token.userId && (!emailInfo || emailInfo.userId !== user.id)) return errorResponse(ctx, 401, 'user_mismatch', 'warn');

    if (emailInfo.userId === user.id && user.id !== token.userId) await handleMembershipTokenUpdate(user.id, token.id);
    // Activate memberships
    const activatedMemberships = await db
      .update(membershipsTable)
      .set({ tokenId: null, activatedAt: getIsoDate() })
      .where(and(eq(membershipsTable.tokenId, token.id)))
      .returning();

    const [targetMembership] = activatedMemberships.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    // Delete token after all activation, since tokenId is cascaded in membershipTable
    await db.delete(tokensTable).where(eq(tokensTable.id, token.id));

    const entityIdField = config.entityIdFields[token.entityType];
    if (!targetMembership[entityIdField]) return errorResponse(ctx, 404, 'not_found', 'warn', token.entityType);

    const entity = await resolveEntity(token.entityType, targetMembership[entityIdField]);
    if (!entity) return errorResponse(ctx, 404, 'not_found', 'warn', token.entityType);

    eventManager.emit('acceptedMembership', targetMembership);

    // Add event only for admins, since only they can see pending invites
    const adminMembers = await db
      .select()
      .from(membershipsTable)
      .where(
        and(eq(membershipsTable.contextType, entity.entityType), eq(membershipsTable.role, 'admin'), eq(membershipsTable[entityIdField], entity.id)),
      );

    sendSSEToUsers(
      adminMembers.map(({ id }) => id),
      'accept_invite',
      entity,
    );

    return ctx.json({ ...entity, membership: targetMembership }, 200);
  })
  /*
   * Start impersonation
   */
  .openapi(authRoutes.startImpersonation, async (ctx) => {
    const { targetUserId } = ctx.req.valid('query');

    const user = getContextUser();
    const sessionData = await getParsedSessionCookie(ctx);

    if (!sessionData) {
      deleteAuthCookie(ctx, 'session');
      return errorResponse(ctx, 401, 'unauthorized', 'warn');
    }

    await setUserSession(ctx, targetUserId, 'password', user.id);

    logEvent('Started impersonation', { admin: user.id, user: targetUserId });

    return ctx.json(true, 200);
  })
  /*
   * Stop impersonation
   */
  .openapi(authRoutes.stopImpersonation, async (ctx) => {
    const sessionData = await getParsedSessionCookie(ctx, true);
    if (!sessionData) return errorResponse(ctx, 401, 'unauthorized', 'warn');

    const { sessionToken, adminUserId } = sessionData;
    const { session } = await validateSession(sessionToken);
    if (!session) return errorResponse(ctx, 401, 'unauthorized', 'warn');

    await invalidateSessionById(session.id, session.userId);
    if (adminUserId) {
      const [adminsLastSession] = await db
        .select()
        .from(sessionsTable)
        .where(eq(sessionsTable.userId, adminUserId))
        .orderBy(desc(sessionsTable.expiresAt))
        .limit(1);

      if (isExpiredDate(adminsLastSession.expiresAt)) {
        await invalidateSessionById(adminsLastSession.id, adminUserId);
        return errorResponse(ctx, 401, 'unauthorized', 'warn');
      }

      const expireTimeSpan = new TimeSpan(adminsLastSession.expiresAt.getTime() - Date.now(), 'ms');
      const cookieContent = `${adminsLastSession.token}.${adminsLastSession.userId ?? ''}`;

      await setAuthCookie(ctx, 'session', cookieContent, expireTimeSpan);
    }

    logEvent('Stopped impersonation', { admin: adminUserId || 'na', user: session.userId });

    return ctx.json(true, 200);
  })
  /*
   * Sign out
   */
  .openapi(authRoutes.signOut, async (ctx) => {
    const sessionData = await getParsedSessionCookie(ctx);

    if (!sessionData) {
      deleteAuthCookie(ctx, 'session');
      return errorResponse(ctx, 401, 'unauthorized', 'warn');
    }

    // Find session & invalidate
    const { session } = await validateSession(sessionData.sessionToken);
    if (session) await invalidateSessionById(session.id, session.userId);

    // Delete session cookie
    deleteAuthCookie(ctx, 'session');

    logEvent('User signed out', { user: session?.userId || 'na' });

    return ctx.json(true, 200);
  })
  /*
   * Github authentication
   */
  .openapi(authRoutes.githubSignIn, async (ctx) => {
    const { type, redirect } = ctx.req.valid('query');

    if (redirect) await handleOAuthRedirect(ctx, redirect);

    let error: ErrorType | null = null;

    // If sign up is disabled, stop early
    if (type === 'invite') error = await handleOAuthInvitation(ctx);
    if (type === 'connect') error = await handleOAuthConnection(ctx);

    if (error) return ctx.json(error, error.status as 400 | 403 | 404);

    const state = generateState();
    const url = githubAuth.createAuthorizationURL(state, githubScopes);

    return await createOauthSession(ctx, 'github', url, state);
  })
  /*
   * Google authentication
   */
  .openapi(authRoutes.googleSignIn, async (ctx) => {
    const { type, redirect } = ctx.req.valid('query');

    if (redirect) await handleOAuthRedirect(ctx, redirect);
    let error: ErrorType | null = null;

    // If sign up is disabled, stop early
    if (type === 'invite') error = await handleOAuthInvitation(ctx);
    if (type === 'connect') error = await handleOAuthConnection(ctx);

    if (error) return ctx.json(error, error.status as 400 | 403 | 404);

    const state = generateState();
    const codeVerifier = generateCodeVerifier();
    const url = googleAuth.createAuthorizationURL(state, codeVerifier, googleScopes);

    return await createOauthSession(ctx, 'google', url, state, codeVerifier);
  })
  /*
   * Microsoft authentication
   */
  .openapi(authRoutes.microsoftSignIn, async (ctx) => {
    const { type, redirect } = ctx.req.valid('query');

    if (redirect) await handleOAuthRedirect(ctx, redirect);
    let error: ErrorType | null = null;

    if (type === 'invite') error = await handleOAuthInvitation(ctx);
    if (type === 'connect') error = await handleOAuthConnection(ctx);

    if (error) return ctx.json(error, error.status as 400 | 403 | 404);

    const state = generateState();
    const codeVerifier = generateCodeVerifier();
    const url = microsoftAuth.createAuthorizationURL(state, codeVerifier, microsoftScopes);

    return await createOauthSession(ctx, 'microsoft', url, state, codeVerifier);
  })
  /*
   * Github authentication callback
   */
  .openapi(authRoutes.githubSignInCallback, async (ctx) => {
    const { code, state, error } = ctx.req.valid('query');

    // redirect if there is no code or error in callback
    if (error || !code) return errorRedirect(ctx, 'oauth_failed', 'error');

    const strategy = 'github' as EnabledOauthProvider;
    if (!isOAuthEnabled(strategy)) return errorResponse(ctx, 400, 'unsupported_oauth', 'error', undefined, { strategy });

    const stateCookie = await getAuthCookie(ctx, 'oauth_state');
    // Verify state
    if (!state || !stateCookie || stateCookie !== state) return errorResponse(ctx, 401, 'invalid_state', 'warn', undefined, { strategy });

    try {
      const githubValidation = await githubAuth.validateAuthorizationCode(code);
      const headers = { Authorization: `Bearer ${githubValidation.accessToken()}` };

      // Parallel API calls to GitHub
      const [githubUserResponse, githubUserEmailsResponse] = await Promise.all([
        fetch('https://api.github.com/user', { headers }),
        fetch('https://api.github.com/user/emails', { headers }),
      ]);

      const githubUser = (await githubUserResponse.json()) as GithubUserProps;
      const githubUserEmails = (await githubUserEmailsResponse.json()) as GithubUserEmailProps[];
      const transformedUser = transformGithubUserData(githubUser, githubUserEmails);

      const provider = { id: strategy, userId: String(githubUser.id) };

      // Check account linking and invitation token handling
      const { connectUserId, inviteToken } = await getOauthCookies(ctx);

      // Find existing user based on email, connectUserId, or invite token id
      const existingUsers = await findExistingUsers(transformedUser.email, connectUserId, inviteToken?.id ?? null);

      // Make sure we have only one user
      if (existingUsers.length > 1) return errorRedirect(ctx, 'oauth_mismatch', 'warn');
      const existingUser = existingUsers[0] ?? null;

      // If registration is disabled and no existing user and not invite throw to error
      if (!config.has.registrationEnabled && !existingUser && !inviteToken) return errorRedirect(ctx, 'sign_up_restricted', 'info');

      // Get the redirect URL based on whether a new user or invite token exists
      const firstSignIn = !connectUserId && !existingUser;
      const redirectUrl = await getOauthRedirectUrl(ctx, firstSignIn);

      // If the user already exists, use existing user logic
      if (existingUser) {
        return await handleExistingUser(ctx, existingUser, transformedUser, provider, connectUserId, redirectUrl);
      }

      // Create new user and OAuth account
      return await handleCreateUser({
        ctx,
        newUser: transformedUser,
        emailVerified: transformedUser.emailVerified,
        redirectUrl,
        provider,
        ...(inviteToken && inviteToken.type === 'membership' && { tokenId: inviteToken.id }),
      });
    } catch (error) {
      // Handle invalid credentials
      if (error instanceof OAuth2RequestError) {
        return errorResponse(ctx, 401, 'invalid_credentials', 'warn', undefined, { strategy });
      }

      if (error instanceof Error) {
        const errorMessage = error.message;
        logEvent('Error signing in with GitHub', { strategy, errorMessage }, 'error');
        return errorResponse(ctx, 401, 'oauth_failed', 'warn', undefined, { strategy });
      }

      throw error;
    } finally {
      clearOauthSession(ctx);
    }
  })
  /*
   * Google authentication callback
   */
  .openapi(authRoutes.googleSignInCallback, async (ctx) => {
    const { state, code } = ctx.req.valid('query');
    const strategy = 'google' as EnabledOauthProvider;

    if (!isOAuthEnabled(strategy)) return errorResponse(ctx, 400, 'unsupported_oauth', 'error', undefined, { strategy });

    const storedState = await getAuthCookie(ctx, 'oauth_state');
    const storedCodeVerifier = await getAuthCookie(ctx, 'oauth_code_verifier');

    // verify state
    if (!code || !storedState || !storedCodeVerifier || state !== storedState) {
      return errorResponse(ctx, 401, 'invalid_state', 'warn', undefined, { strategy });
    }

    try {
      const googleValidation = await googleAuth.validateAuthorizationCode(code, storedCodeVerifier);
      const headers = { Authorization: `Bearer ${googleValidation.accessToken()}` };

      // Get user info from google
      const response = await fetch('https://openidconnect.googleapis.com/v1/userinfo', { headers });

      const googleUser = (await response.json()) as GoogleUserProps;
      const transformedUser = transformSocialUserData(googleUser);

      const provider = { id: strategy, userId: googleUser.sub };

      // Check account linking and invitation token handling
      const { connectUserId, inviteToken } = await getOauthCookies(ctx);

      // Find existing user based on email, connectUserId, or invite token id
      const existingUsers = await findExistingUsers(transformedUser.email, connectUserId, inviteToken?.id ?? null);

      // Make sure we have only one user
      if (existingUsers.length > 1) return errorRedirect(ctx, 'oauth_mismatch', 'warn');
      const existingUser = existingUsers[0] ?? null;

      // If registration is disabled and no existing user and not invite throw to error
      if (!config.has.registrationEnabled && !existingUser && !inviteToken) return errorRedirect(ctx, 'sign_up_restricted', 'info');

      // Get the redirect URL based on whether a new user or invite token exists
      const firstSignIn = !connectUserId && !existingUser;
      const redirectUrl = await getOauthRedirectUrl(ctx, firstSignIn);

      // If the user already exists, use existing user logic
      if (existingUser) {
        return await handleExistingUser(ctx, existingUser, transformedUser, provider, connectUserId, redirectUrl);
      }

      // Create a new user and associated OAuth account
      return await handleCreateUser({
        ctx,
        newUser: transformedUser,
        emailVerified: transformedUser.emailVerified,
        redirectUrl,
        provider,
        ...(inviteToken?.type === 'membership' && { tokenId: inviteToken.id }), // Conditionally add tokenId if membership invitation
      });
    } catch (error) {
      // Handle invalid credentials
      if (error instanceof OAuth2RequestError) {
        return errorResponse(ctx, 401, 'invalid_credentials', 'warn', undefined, { strategy });
      }

      if (error instanceof Error) {
        const errorMessage = error.message;
        logEvent('Error signing in with Google', { strategy, errorMessage }, 'error');
        return errorResponse(ctx, 401, 'oauth_failed', 'warn', undefined, { strategy });
      }

      throw error;
    } finally {
      clearOauthSession(ctx);
    }
  })
  /*
   * Microsoft authentication callback
   */
  .openapi(authRoutes.microsoftSignInCallback, async (ctx) => {
    const { state, code } = ctx.req.valid('query');
    const strategy = 'microsoft' as EnabledOauthProvider;

    if (!isOAuthEnabled(strategy)) return errorResponse(ctx, 400, 'unsupported_oauth', 'error', undefined, { strategy });

    const storedState = await getAuthCookie(ctx, 'oauth_state');
    const storedCodeVerifier = await getAuthCookie(ctx, 'oauth_code_verifier');

    // verify state
    if (!code || !storedState || !storedCodeVerifier || state !== storedState) {
      return errorResponse(ctx, 401, 'invalid_state', 'warn', undefined, { strategy });
    }

    try {
      const microsoftValidation = await microsoftAuth.validateAuthorizationCode(code, storedCodeVerifier);
      const headers = { Authorization: `Bearer ${microsoftValidation.accessToken()}` };

      // Get user info from microsoft
      const response = await fetch('https://graph.microsoft.com/oidc/userinfo', { headers });

      const microsoftUser = (await response.json()) as MicrosoftUserProps;
      const transformedUser = transformSocialUserData(microsoftUser);

      const provider = { id: strategy, userId: microsoftUser.sub };

      // Check account linking and invitation token handling
      const { connectUserId, inviteToken } = await getOauthCookies(ctx);

      // Find existing user based on email, connectUserId, or invite token id
      const existingUsers = await findExistingUsers(transformedUser.email, connectUserId, inviteToken?.id ?? null);

      // Make sure we have only one user
      if (existingUsers.length > 1) return errorRedirect(ctx, 'oauth_mismatch', 'warn');
      const existingUser = existingUsers[0] ?? null;

      // If registration is disabled and no existing user and not invite throw to error
      if (!config.has.registrationEnabled && !existingUser && !inviteToken) return errorRedirect(ctx, 'sign_up_restricted', 'info');

      // Get the redirect URL based on whether a new user or invite token exists
      const firstSignIn = !connectUserId && !existingUser;
      const redirectUrl = await getOauthRedirectUrl(ctx, firstSignIn);

      // If the user already exists, use existing user logic
      if (existingUser) {
        return await handleExistingUser(ctx, existingUser, transformedUser, provider, connectUserId, redirectUrl);
      }

      // Create new user and oauth account
      return await handleCreateUser({
        ctx,
        newUser: transformedUser,
        emailVerified: transformedUser.emailVerified,
        redirectUrl,
        provider,
        ...(inviteToken && inviteToken.type === 'membership' && { tokenId: inviteToken.id }),
      });
    } catch (error) {
      // Handle invalid credentials
      if (error instanceof OAuth2RequestError) {
        return errorResponse(ctx, 401, 'invalid_credentials', 'warn', undefined, { strategy });
      }

      if (error instanceof Error) {
        const errorMessage = error.message;
        logEvent('Error signing in with Microsoft', { strategy, errorMessage }, 'error');
        return errorResponse(ctx, 401, 'oauth_failed', 'warn', undefined, { strategy });
      }

      throw error;
    } finally {
      clearOauthSession(ctx);
    }
  })
  /*
   * Passkey challenge
   */
  .openapi(authRoutes.getPasskeyChallenge, async (ctx) => {
    // Generate a random challenge
    const challenge = getRandomValues(new Uint8Array(32));

    // Convert to string
    const challengeBase64 = encodeBase64(challenge);

    // Save challenge in cookie
    await setAuthCookie(ctx, 'passkey_challenge', challengeBase64, new TimeSpan(5, 'm'));
    return ctx.json({ challengeBase64 }, 200);
  })
  /*
   * Verify passkey
   */
  .openapi(authRoutes.verifyPasskey, async (ctx) => {
    const { clientDataJSON, authenticatorData, signature, userEmail } = ctx.req.valid('json');
    const strategy = 'passkey';

    // Retrieve user and challenge record
    const user = await getUserBy('email', userEmail.toLowerCase());
    if (!user) return errorResponse(ctx, 404, 'not_found', 'warn', 'user', { strategy });

    // Check if passkey challenge exists
    const challengeFromCookie = await getAuthCookie(ctx, 'passkey_challenge');
    if (!challengeFromCookie) return errorResponse(ctx, 401, 'invalid_credentials', 'warn', undefined, { strategy });

    // Get passkey credentials
    const [credentials] = await db.select().from(passkeysTable).where(eq(passkeysTable.userEmail, userEmail));
    if (!credentials) return errorResponse(ctx, 404, 'not_found', 'warn', undefined, { strategy });

    try {
      const isValid = await verifyPassKeyPublic(signature, authenticatorData, clientDataJSON, credentials.publicKey, challengeFromCookie);
      if (!isValid) return errorResponse(ctx, 401, 'invalid_token', 'warn', undefined, { strategy });
    } catch (error) {
      if (error instanceof Error) {
        const errorMessage = error.message;
        logEvent('Error verifying passkey', { strategy, errorMessage }, 'error');
        return errorResponse(ctx, 500, 'passkey_failed', 'error', undefined, { strategy });
      }
    }

    await setUserSession(ctx, user.id, 'passkey');
    return ctx.json(true, 200);
  });

export default authRouteHandlers;
