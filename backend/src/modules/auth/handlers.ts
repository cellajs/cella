import { getRandomValues } from 'node:crypto';
import { OpenAPIHono } from '@hono/zod-openapi';
import { encodeBase64 } from '@oslojs/encoding';
import { OAuth2RequestError, generateCodeVerifier, generateState } from 'arctic';
import type { EnabledOauthProvider } from 'config';
import { config } from 'config';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '#/db/db';
import { type EmailsModel, emailsTable } from '#/db/schema/emails';
import { membershipsTable } from '#/db/schema/memberships';
import { oauthAccountsTable } from '#/db/schema/oauth-accounts';
import { organizationsTable } from '#/db/schema/organizations';
import { passkeysTable } from '#/db/schema/passkeys';
import { sessionsTable } from '#/db/schema/sessions';
import { tokensTable } from '#/db/schema/tokens';
import { type UserModel, usersTable } from '#/db/schema/users';
import { type Env, getContextToken, getContextUser } from '#/lib/context';
import { errorRedirect, errorResponse } from '#/lib/errors';
import { i18n } from '#/lib/i18n';
import { mailer } from '#/lib/mailer';
import { logEvent } from '#/middlewares/logger/log-event';
import { hashPassword, verifyPasswordHash } from '#/modules/auth/helpers/argon2id';
import {
  clearOauthSession,
  createOauthSession,
  findExistingUser,
  getOauthCookies,
  getOauthRedirectUrl,
  handleExistingOauthAccount,
  slugFromEmail,
  transformGithubUserData,
  transformSocialUserData,
  updateExistingUser,
} from '#/modules/auth/helpers/oauth';
import {
  githubAuth,
  type githubUserEmailProps,
  type githubUserProps,
  googleAuth,
  type googleUserProps,
  microsoftAuth,
  type microsoftUserProps,
} from '#/modules/auth/helpers/oauth-providers';
import defaultHook from '#/utils/default-hook';
import { getIsoDate } from '#/utils/iso-date';
import { nanoid } from '#/utils/nanoid';
import { TimeSpan, createDate, isExpiredDate } from '#/utils/time-span';
import { CreatePasswordEmail, type CreatePasswordEmailProps } from '../../../emails/create-password';
import { EmailVerificationEmail, type EmailVerificationEmailProps } from '../../../emails/email-verification';
import { getUserBy } from '../users/helpers/get-user-by';
import { deleteAuthCookie, getAuthCookie, setAuthCookie } from './helpers/cookie';
import { handleInvitationToken } from './helpers/oauth';
import { verifyPassKeyPublic } from './helpers/passkey';
import { getParsedSessionCookie, invalidateSessionById, setUserSession, validateSession } from './helpers/session';
import { handleCreateUser, handleTokenUpdate } from './helpers/user';
import { sendVerificationEmail } from './helpers/verify-email';
import authRouteConfig from './routes';

const enabledStrategies: readonly string[] = config.enabledAuthenticationStrategies;
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

// Set default hook to catch validation errors
const app = new OpenAPIHono<Env>({ defaultHook });

const authRoutes = app
  /*
   * Check if email exists
   */
  .openapi(authRouteConfig.checkEmail, async (ctx) => {
    const { email } = ctx.req.valid('json');

    const user = await getUserBy('email', email.toLowerCase());
    if (!user) return errorResponse(ctx, 404, 'not_found', 'warn', 'user');

    return ctx.json({ success: true }, 200);
  })
  /*
   * Sign up with email & password.
   * Attention: sign up is also used for new users that received (system or membership) invitations.
   * Only for membership invitations, user will proceed to accept after signing up.
   */
  .openapi(authRouteConfig.signUp, async (ctx) => {
    const { email, password } = ctx.req.valid('json');

    // Verify if strategy allowed
    const strategy = 'password';
    if (!enabledStrategies.includes(strategy)) {
      return errorResponse(ctx, 400, 'forbidden_strategy', 'warn', undefined, { strategy });
    }

    // Stop if sign up is disabled and no invitation
    if (!config.has.registrationEnabled) return errorResponse(ctx, 403, 'sign_up_restricted', 'warn');

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
  .openapi(authRouteConfig.signUpWithToken, async (ctx) => {
    const { password } = ctx.req.valid('json');
    const userId = nanoid();

    const validToken = getContextToken();
    if (!validToken) return errorResponse(ctx, 400, 'invalid_request', 'warn');

    // Verify if strategy allowed
    const strategy = 'password';
    if (!enabledStrategies.includes(strategy)) {
      return errorResponse(ctx, 400, 'forbidden_strategy', 'warn', undefined, { strategy });
    }

    // Delete token to not needed anymore (if no membership invitation)
    if (!validToken.entity) await db.delete(tokensTable).where(eq(tokensTable.id, validToken.id));

    const hashedPassword = await hashPassword(password);
    const slug = slugFromEmail(validToken.email);

    // Create user & send verification email
    const newUser = { id: userId, slug, name: slug, email: validToken.email, hashedPassword };

    const redirectUrl = validToken.entity ? `${config.frontendUrl}/invitation/${validToken.token}?tokenId=${validToken.id}` : null;
    return await handleCreateUser({ ctx, newUser, redirectUrl, emailVerified: true, tokenId: validToken.id });
  })
  /*
   * Send verification email, also used to resend verification email.
   */
  .openapi(authRouteConfig.sendVerificationEmail, async (ctx) => {
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
        set: { tokenId: tokenRecord.id },
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

    return ctx.json({ success: true }, 200);
  })
  /*
   * Verify email
   */
  .openapi(authRouteConfig.verifyEmail, async (ctx) => {
    const token = getContextToken();
    if (!token || !token.userId) return errorResponse(ctx, 400, 'invalid_request', 'warn');

    // Set email verified
    await db.update(emailsTable).set({ verified: true, verifiedAt: getIsoDate() }).where(eq(emailsTable.tokenId, token.id));

    // Delete token to prevent reuse
    await db.delete(tokensTable).where(eq(tokensTable.id, token.id));

    // Sign in user
    await setUserSession(ctx, token.userId, 'email_verification');

    return ctx.json({ success: true }, 200);
  })
  /*
   * Request reset password email
   */
  .openapi(authRouteConfig.requestPassword, async (ctx) => {
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

    return ctx.json({ success: true }, 200);
  })
  /*
   * Create password with token
   */
  .openapi(authRouteConfig.createPasswordWithToken, async (ctx) => {
    const { password } = ctx.req.valid('json');
    const token = getContextToken();

    // Verify if strategy allowed
    const strategy = 'password';
    if (!enabledStrategies.includes(strategy)) {
      return errorResponse(ctx, 400, 'forbidden_strategy', 'warn', undefined, { strategy });
    }

    // If the token is not found or expired
    if (!token || !token.userId) return errorResponse(ctx, 401, 'invalid_token', 'warn');

    // Delete token to prevent reuse
    await db.delete(tokensTable).where(and(eq(tokensTable.id, token.id), eq(tokensTable.type, 'password_reset')));

    const user = await getUserBy('id', token.userId);
    // If the user is not found or the email is different from the token email
    if (!user || user.email !== token.email) return errorResponse(ctx, 404, 'not_found', 'warn', 'user', { userId: token.userId });

    // Hash password
    const hashedPassword = await hashPassword(password);

    // update user password and set email verified
    await Promise.all([
      db.update(usersTable).set({ hashedPassword }).where(eq(usersTable.id, user.id)),
      db.update(emailsTable).set({ verified: true, verifiedAt: getIsoDate() }).where(eq(emailsTable.email, user.email)),
    ]);

    // Sign in user
    await setUserSession(ctx, user.id, 'password_reset');

    return ctx.json({ success: true }, 200);
  })
  /*
   * Sign in with email and password
   * Attention: sign in is also used to accept organization invitations (when signed out & user exists),
   * after signing in, we proceed to accept the invitation.
   */
  .openapi(authRouteConfig.signIn, async (ctx) => {
    const { email, password } = ctx.req.valid('json');

    // Verify if strategy allowed
    const strategy = 'password';
    if (!enabledStrategies.includes(strategy)) {
      return errorResponse(ctx, 400, 'forbidden_strategy', 'warn', undefined, { strategy });
    }

    const loweredEmail = email.toLowerCase();

    const [user, [emailInfo]] = await Promise.all([
      getUserBy('email', loweredEmail, 'unsafe'),
      db.select().from(emailsTable).where(eq(emailsTable.email, loweredEmail)),
    ]);

    // If user is not found or doesn't have password
    if (!user) return errorResponse(ctx, 404, 'not_found', 'warn', 'user');
    if (!user.hashedPassword) return errorResponse(ctx, 404, 'no_password_found', 'warn');

    // Verify password
    const validPassword = await verifyPasswordHash(user.hashedPassword, password);
    if (!validPassword) return errorResponse(ctx, 403, 'invalid_password', 'warn');

    // If email is not verified, send verification email
    if (!emailInfo.verified) sendVerificationEmail(user.id);
    // Sign in user
    else await setUserSession(ctx, user.id, 'password');

    return ctx.json({ success: true, data: { emailVerified: emailInfo.verified } }, 200);
  })
  /*
   * Check token (token validation)
   */
  .openapi(authRouteConfig.checkToken, async (ctx) => {
    // Find token in request
    const { id } = ctx.req.valid('param');
    const { type } = ctx.req.valid('query');

    // Check if token exists
    const [tokenRecord] = await db.select().from(tokensTable).where(eq(tokensTable.id, id));
    if (!tokenRecord) return errorResponse(ctx, 404, `${type}_not_found`, 'warn');

    // If token is expired, return an error
    if (isExpiredDate(tokenRecord.expiresAt)) return errorResponse(ctx, 401, `${type}_expired`, 'warn', undefined);

    const data = {
      email: tokenRecord.email,
      userId: tokenRecord.userId || '',
    };

    if (!tokenRecord.organizationId) return ctx.json({ success: true, data }, 200);

    // If it is a membership invitation, get organization details
    const [organization] = await db.select().from(organizationsTable).where(eq(organizationsTable.id, tokenRecord.organizationId));
    if (!organization) return errorResponse(ctx, 404, 'not_found', 'warn', 'organization');

    const dataWithOrg = {
      email: tokenRecord.email,
      userId: tokenRecord.userId || '',
      organizationId: organization.id || '',
      organizationName: organization.name || '',
      organizationSlug: organization.slug || '',
    };

    return ctx.json({ success: true, data: dataWithOrg }, 200);
  })
  /*
   * Accept org invite token for signed in users
   */
  //TODO (rename, replace(memberships))? could we use it with other entities invite?
  .openapi(authRouteConfig.acceptOrgInvite, async (ctx) => {
    const user = getContextUser();
    const token = getContextToken();

    // Make sure its an organization invitation
    if (!token.entity) return errorResponse(ctx, 401, 'invalid_token', 'warn');

    const [emailInfo]: (EmailsModel | undefined)[] = await db.select().from(emailsTable).where(eq(emailsTable.email, token.email));
    // Ensure correct user is accepting the invitation
    if (user.id !== token.userId && emailInfo?.userId !== user.id) return errorResponse(ctx, 401, 'user_mismatch', 'warn');

    // If user ID matches email info update the token
    if (user.id !== token.userId && emailInfo?.userId === user.id) await handleTokenUpdate(user.id, token.id);

    // Activate memberships
    await db
      .update(membershipsTable)
      .set({ tokenId: null, activatedAt: getIsoDate() })
      .where(and(eq(membershipsTable.tokenId, token.id)));

    // Delete token after all activation, since tokenId is cascaded in membershipTable
    await db.delete(tokensTable).where(eq(tokensTable.id, token.id));

    return ctx.json({ success: true }, 200);
  })
  /*
   * Start impersonation
   */
  .openapi(authRouteConfig.startImpersonation, async (ctx) => {
    const { targetUserId } = ctx.req.valid('query');

    const user = getContextUser();
    const sessionData = await getParsedSessionCookie(ctx);

    if (!sessionData) {
      deleteAuthCookie(ctx, 'session');
      return errorResponse(ctx, 401, 'unauthorized', 'warn');
    }

    await setUserSession(ctx, targetUserId, 'impersonation', user.id);

    logEvent('Started impersonation', { admin: user.id, user: targetUserId });

    return ctx.json({ success: true }, 200);
  })
  /*
   * Stop impersonation
   */
  .openapi(authRouteConfig.stopImpersonation, async (ctx) => {
    const sessionData = await getParsedSessionCookie(ctx, true);
    if (!sessionData) return errorResponse(ctx, 401, 'unauthorized', 'warn');

    const { sessionToken, adminUserId } = sessionData;
    const { session } = await validateSession(sessionToken);
    if (!session) return errorResponse(ctx, 401, 'unauthorized', 'warn');

    await invalidateSessionById(session.id);
    if (adminUserId) {
      const [adminsLastSession] = await db
        .select()
        .from(sessionsTable)
        .where(eq(sessionsTable.userId, adminUserId))
        .orderBy(desc(sessionsTable.expiresAt))
        .limit(1);

      if (isExpiredDate(adminsLastSession.expiresAt)) {
        await invalidateSessionById(adminsLastSession.id);
        return errorResponse(ctx, 401, 'unauthorized', 'warn');
      }

      const expireTimeSpan = new TimeSpan(adminsLastSession.expiresAt.getTime() - Date.now(), 'ms');
      const cookieContent = JSON.stringify({ sessionToken: adminsLastSession.token });
      await setAuthCookie(ctx, 'session', cookieContent, expireTimeSpan);
    }

    logEvent('Stopped impersonation', { admin: adminUserId || 'na', user: session.userId });

    return ctx.json({ success: true }, 200);
  })
  /*
   * Sign out
   */
  .openapi(authRouteConfig.signOut, async (ctx) => {
    const sessionData = await getParsedSessionCookie(ctx);

    if (!sessionData) {
      deleteAuthCookie(ctx, 'session');
      return errorResponse(ctx, 401, 'unauthorized', 'warn');
    }

    // Find session & invalidate
    const { session } = await validateSession(sessionData.sessionToken);
    if (session) await invalidateSessionById(session.id);

    // Delete session cookie
    deleteAuthCookie(ctx, 'session');

    logEvent('User signed out', { user: session?.userId || 'na' });

    return ctx.json({ success: true }, 200);
  })
  /*
   * Github authentication
   */
  .openapi(authRouteConfig.githubSignIn, async (ctx) => {
    const { connect } = ctx.req.valid('query');

    const state = generateState();
    const url = githubAuth.createAuthorizationURL(state, githubScopes);

    const { redirectUrl, tokenId, error } = await handleInvitationToken(ctx);

    if (error) return ctx.json({ success: false, error }, error.status as 400 | 403 | 404);

    return await createOauthSession(ctx, 'github', url, state, '', redirectUrl, connect, tokenId);
  })
  /*
   * Google authentication
   */
  .openapi(authRouteConfig.googleSignIn, async (ctx) => {
    const { connect } = ctx.req.valid('query');

    const state = generateState();
    const codeVerifier = generateCodeVerifier();
    const url = googleAuth.createAuthorizationURL(state, codeVerifier, googleScopes);

    const { redirectUrl, tokenId, error } = await handleInvitationToken(ctx);

    if (error) return ctx.json({ success: false, error }, error.status as 400 | 403 | 404);

    return await createOauthSession(ctx, 'google', url, state, codeVerifier, redirectUrl, connect, tokenId);
  })
  /*
   * Microsoft authentication
   */
  .openapi(authRouteConfig.microsoftSignIn, async (ctx) => {
    const { connect } = ctx.req.valid('query');

    const state = generateState();
    const codeVerifier = generateCodeVerifier();
    const url = microsoftAuth.createAuthorizationURL(state, codeVerifier, microsoftScopes);

    const { redirectUrl, tokenId, error } = await handleInvitationToken(ctx);

    if (error) return ctx.json({ success: false, error }, error.status as 400 | 403 | 404);

    return await createOauthSession(ctx, 'microsoft', url, state, codeVerifier, redirectUrl, connect, tokenId);
  })
  /*
   * Github authentication callback
   */
  .openapi(authRouteConfig.githubSignInCallback, async (ctx) => {
    const { code, state, error } = ctx.req.valid('query');

    // redirect if there is no code or error in callback
    if (error || !code) return errorRedirect(ctx, 'oauth_failed', 'error');

    const strategy = 'github' as EnabledOauthProvider;
    if (!isOAuthEnabled(strategy)) return errorResponse(ctx, 400, 'unsupported_oauth', 'warn', undefined, { strategy });

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

      const githubUser: githubUserProps = await githubUserResponse.json();
      const githubUserEmails: githubUserEmailProps[] = await githubUserEmailsResponse.json();

      const provider = { id: strategy, userId: String(githubUser.id) };

      // Check account linking, invite
      const { userId, inviteTokenId } = await getOauthCookies(ctx);

      // Check if OAuth account already exists
      const existingStatus = await handleExistingOauthAccount(ctx, strategy, provider.userId, userId);
      if (existingStatus === 'mismatch') return errorRedirect(ctx, 'oauth_mismatch', 'warn');

      // Get redirect URL based on existingStatus
      const redirectUrl = await getOauthRedirectUrl(ctx, existingStatus === null && !inviteTokenId);
      if (existingStatus === 'auth') return ctx.redirect(redirectUrl, 302);

      const transformedUser = transformGithubUserData(githubUser, githubUserEmails);

      const emailVerified = transformedUser.emailVerified || !!inviteTokenId;

      const existingUser = await findExistingUser(transformedUser.email, userId, inviteTokenId);

      if (existingUser) {
        const [existingOauth] = await db
          .select()
          .from(oauthAccountsTable)
          .where(and(eq(oauthAccountsTable.userId, existingUser.id), eq(oauthAccountsTable.providerId, provider.id)));

        if (!existingOauth) {
          const { slug, name, emailVerified: transformVerified, ...providerUser } = transformedUser;
          return await updateExistingUser(ctx, existingUser, strategy, { providerUser, redirectUrl, emailVerified });
        }
        if (existingOauth.providerUserId !== provider.userId) return errorRedirect(ctx, 'oauth_merge_error', 'error');

        return ctx.redirect(redirectUrl, 302);
      }

      // Create new user and OAuth account
      return await handleCreateUser({ ctx, newUser: transformedUser, redirectUrl, provider, emailVerified, tokenId: inviteTokenId });
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
  .openapi(authRouteConfig.googleSignInCallback, async (ctx) => {
    const { state, code } = ctx.req.valid('query');
    const strategy = 'google' as EnabledOauthProvider;

    if (!isOAuthEnabled(strategy)) return errorResponse(ctx, 400, 'unsupported_oauth', 'warn', undefined, { strategy });

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

      const googleUser: googleUserProps = await response.json();
      const provider = { id: strategy, userId: googleUser.sub };

      // Check account linking, invite
      const { userId, inviteTokenId } = await getOauthCookies(ctx);

      // Check if oauth account already exists
      const existingStatus = await handleExistingOauthAccount(ctx, strategy, provider.userId, userId);
      if (existingStatus === 'mismatch') return errorRedirect(ctx, 'oauth_mismatch', 'warn');

      // Get redirectUrl based of existingStatus
      const redirectUrl = await getOauthRedirectUrl(ctx, existingStatus === null && !inviteTokenId);
      if (existingStatus === 'auth') return ctx.redirect(redirectUrl, 302);

      const transformedUser = transformSocialUserData(googleUser);

      const emailVerified = transformedUser.emailVerified || !!inviteTokenId;

      const existingUser = await findExistingUser(transformedUser.email, userId, inviteTokenId);

      if (existingUser) {
        const [existingOauth] = await db
          .select()
          .from(oauthAccountsTable)
          .where(and(eq(oauthAccountsTable.userId, existingUser.id), eq(oauthAccountsTable.providerId, provider.id)));

        if (!existingOauth) {
          const { slug, name, emailVerified: transformVerified, ...providerUser } = transformedUser;
          return await updateExistingUser(ctx, existingUser, strategy, { providerUser, redirectUrl, emailVerified });
        }
        if (existingOauth.providerUserId !== provider.userId) return errorRedirect(ctx, 'oauth_merge_error', 'error');

        return ctx.redirect(redirectUrl, 302);
      }

      // Create new user and oauth account
      return await handleCreateUser({ ctx, newUser: transformedUser, emailVerified, redirectUrl, provider, tokenId: inviteTokenId });
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
  .openapi(authRouteConfig.microsoftSignInCallback, async (ctx) => {
    const { state, code } = ctx.req.valid('query');
    const strategy = 'microsoft' as EnabledOauthProvider;

    if (!isOAuthEnabled(strategy)) return errorResponse(ctx, 400, 'unsupported_oauth', 'warn', undefined, { strategy });

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

      const microsoftUser: microsoftUserProps = await response.json();
      const provider = { id: strategy, userId: microsoftUser.sub };

      const { userId, inviteTokenId } = await getOauthCookies(ctx);

      // Check if oauth account already exists
      const existingStatus = await handleExistingOauthAccount(ctx, strategy, provider.userId, userId || '');
      if (existingStatus === 'mismatch') return errorRedirect(ctx, 'oauth_mismatch', 'warn');

      // Get redirectUrl based of existingStatus
      const redirectUrl = await getOauthRedirectUrl(ctx, existingStatus === null && !inviteTokenId);
      if (existingStatus === 'auth') return ctx.redirect(redirectUrl, 302);

      const transformedUser = transformSocialUserData(microsoftUser);

      const emailVerified = transformedUser.emailVerified || !!inviteTokenId;

      const existingUser = await findExistingUser(transformedUser.email, userId, inviteTokenId);

      if (existingUser) {
        const [existingOauth] = await db
          .select()
          .from(oauthAccountsTable)
          .where(and(eq(oauthAccountsTable.userId, existingUser.id), eq(oauthAccountsTable.providerId, provider.id)));

        if (!existingOauth) {
          const { slug, name, emailVerified: transformVerified, ...providerUser } = transformedUser;
          return await updateExistingUser(ctx, existingUser, strategy, { providerUser, redirectUrl, emailVerified });
        }
        if (existingOauth.providerUserId !== provider.userId) return errorRedirect(ctx, 'oauth_merge_error', 'error');

        return ctx.redirect(redirectUrl, 302);
      }

      // Create new user and oauth account
      return await handleCreateUser({ ctx, newUser: transformedUser, redirectUrl, provider, emailVerified, tokenId: inviteTokenId });
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
  .openapi(authRouteConfig.getPasskeyChallenge, async (ctx) => {
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
  .openapi(authRouteConfig.verifyPasskey, async (ctx) => {
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
    return ctx.json({ success: true }, 200);
  });

export default authRoutes;
