import { getRandomValues } from 'node:crypto';
import { OpenAPIHono } from '@hono/zod-openapi';
import { encodeBase64 } from '@oslojs/encoding';
import { OAuth2RequestError, generateCodeVerifier, generateState } from 'arctic';
import type { EnabledOauthProvider } from 'config';
import { config } from 'config';
import { and, desc, eq, or } from 'drizzle-orm';
import slugify from 'slugify';
import { db } from '#/db/db';
import { membershipsTable } from '#/db/schema/memberships';
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
  githubAuth,
  type githubUserEmailProps,
  type githubUserProps,
  googleAuth,
  type googleUserProps,
  microsoftAuth,
  type microsoftUserProps,
} from '#/modules/auth/helpers/oauth-providers';
import { getUserBy, getUsersByConditions } from '#/modules/users/helpers/get-user-by';
import { nanoid } from '#/utils/nanoid';
import { TimeSpan, createDate, isExpiredDate } from '#/utils/time-span';
import { CreatePasswordEmail, type CreatePasswordEmailProps } from '../../../emails/create-password';
import { EmailVerificationEmail, type EmailVerificationEmailProps } from '../../../emails/email-verification';
import { deleteAuthCookie, getAuthCookie, setAuthCookie } from './helpers/cookie';
import {
  clearOauthSession,
  createOauthSession,
  getOauthRedirectUrl,
  handleExistingOauthAccount,
  slugFromEmail,
  splitFullName,
  updateExistingUser,
} from './helpers/oauth';
import { parseAndValidatePasskeyAttestation, verifyPassKeyPublic } from './helpers/passkey';
import { invalidateSessionById, invalidateUserSessions, setUserSession, validateSession } from './helpers/session';
import { handleCreateUser } from './helpers/user';
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

const app = new OpenAPIHono<Env>();

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
    const newUser = {
      slug,
      name: slug,
      email: email,
      emailVerified: false,
      hashedPassword,
    };

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
    if (!validToken.organizationId) await db.delete(tokensTable).where(eq(tokensTable.id, validToken.id));

    const hashedPassword = await hashPassword(password);
    const slug = slugFromEmail(validToken.email);

    // Create user & send verification email
    const newUser = {
      id: userId,
      slug,
      name: slug,
      email: validToken.email,
      emailVerified: true,
      hashedPassword,
    };

    return await handleCreateUser({ ctx, newUser, tokenId: validToken.id });
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

    // Delete token to prevent reuse
    await db.delete(tokensTable).where(eq(tokensTable.id, token.id));

    // Set email verified
    await db.update(usersTable).set({ emailVerified: true }).where(eq(usersTable.id, token.userId));

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

    // Clear all sessions
    // TODO delete cookie too?
    await invalidateUserSessions(user.id);

    // Hash password
    const hashedPassword = await hashPassword(password);

    // update user password and set email verified
    await db.update(usersTable).set({ hashedPassword, emailVerified: true }).where(eq(usersTable.id, user.id));

    // Sign in user
    await setUserSession(ctx, user.id, 'password_reset');

    return ctx.json({ success: true }, 200);
  })
  /*
   * Sign in with email and password
   * Attention: sign in is also used to accept organization invitations (when signed out),
   * after signing in, we proceed to accept the invitation.
   */
  .openapi(authRouteConfig.signIn, async (ctx) => {
    const { email, password } = ctx.req.valid('json');

    // Verify if strategy allowed
    const strategy = 'password';
    if (!enabledStrategies.includes(strategy)) {
      return errorResponse(ctx, 400, 'forbidden_strategy', 'warn', undefined, { strategy });
    }

    const user = await getUserBy('email', email.toLowerCase(), 'unsafe');

    // If user is not found or doesn't have password
    if (!user) return errorResponse(ctx, 404, 'not_found', 'warn', 'user');
    if (!user.hashedPassword) return errorResponse(ctx, 404, 'no_password_found', 'warn');

    // Verify password
    const validPassword = await verifyPasswordHash(user.hashedPassword, password);
    if (!validPassword) return errorResponse(ctx, 403, 'invalid_password', 'warn');

    const emailVerified = user.emailVerified;

    // If email is not verified, send verification email
    if (!emailVerified) sendVerificationEmail(user.id);
    // Sign in user
    else await setUserSession(ctx, user.id, 'password');

    return ctx.json({ success: true, data: { emailVerified } }, 200);
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
  .openapi(authRouteConfig.acceptOrgInvite, async (ctx) => {
    const user = getContextUser();
    const token = getContextToken();

    // Make sure its an organization invitation
    if (!token.organizationId || !token.role) return errorResponse(ctx, 401, 'invalid_token', 'warn');

    // Make sure correct user accepts invitation (for example another user could have a sessions and click on email invite of another user)
    if (user.id !== token.userId) return errorResponse(ctx, 401, 'user_mismatch', 'warn');

    // Activate memberships
    await db
      .update(membershipsTable)
      .set({ tokenId: null, activatedAt: new Date() })
      .where(and(eq(membershipsTable.tokenId, token.id)));

    // Delete token after all activation, since tokenId is cascaded in membershipTable
    await db.delete(tokensTable).where(eq(tokensTable.id, token.id));

    return ctx.json({ success: true }, 200);
  })
  /*
   * TODO simplify: Start impersonation
   */
  .openapi(authRouteConfig.startImpersonation, async (ctx) => {
    const user = getContextUser();
    const sessionToken = await getAuthCookie(ctx, 'session');

    if (!sessionToken) {
      deleteAuthCookie(ctx, 'session');
      return errorResponse(ctx, 401, 'unauthorized', 'warn');
    }

    const { targetUserId } = ctx.req.valid('query');
    await setUserSession(ctx, targetUserId, 'impersonation', user.id);

    return ctx.json({ success: true }, 200);
  })
  /*
   * Stop impersonation
   */
  .openapi(authRouteConfig.stopImpersonation, async (ctx) => {
    const sessionToken = deleteAuthCookie(ctx, 'session');
    if (!sessionToken) return errorResponse(ctx, 401, 'unauthorized', 'warn');

    const { session } = await validateSession(sessionToken);
    if (!session) return errorResponse(ctx, 401, 'unauthorized', 'warn');

    await invalidateSessionById(session.id);
    if (session.adminUserId) {
      const [adminsLastSession] = await db
        .select()
        .from(sessionsTable)
        .where(eq(sessionsTable.userId, session.adminUserId))
        .orderBy(desc(sessionsTable.expiresAt))
        .limit(1);

      if (isExpiredDate(adminsLastSession.expiresAt)) {
        await invalidateSessionById(adminsLastSession.id);
        return errorResponse(ctx, 401, 'unauthorized', 'warn');
      }

      const expireTimeSpan = new TimeSpan(adminsLastSession.expiresAt.getTime() - Date.now(), 'ms');
      await setAuthCookie(ctx, 'session', adminsLastSession.token, expireTimeSpan);
    }

    logEvent('Admin user signed out from impersonate to his own account', { user: session?.adminUserId || 'na' });

    return ctx.json({ success: true }, 200);
  })
  /*
   * Sign out
   */
  .openapi(authRouteConfig.signOut, async (ctx) => {
    const sessionToken = await getAuthCookie(ctx, 'session');

    if (!sessionToken) {
      deleteAuthCookie(ctx, 'session');
      return errorResponse(ctx, 401, 'unauthorized', 'warn');
    }

    // Find session & invalidate
    const { session } = await validateSession(sessionToken);
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
    const { redirect, connect, token } = ctx.req.valid('query');

    const state = generateState();
    const url = githubAuth.createAuthorizationURL(state, githubScopes);

    return await createOauthSession(ctx, 'github', url, state, '', redirect, connect, token);
  })
  /*
   * Google authentication
   */
  .openapi(authRouteConfig.googleSignIn, async (ctx) => {
    const { redirect, connect, token } = ctx.req.valid('query');

    const state = generateState();
    const codeVerifier = generateCodeVerifier();
    const url = googleAuth.createAuthorizationURL(state, codeVerifier, googleScopes);

    return await createOauthSession(ctx, 'google', url, state, codeVerifier, redirect, connect, token);
  })
  /*
   * Microsoft authentication
   */
  .openapi(authRouteConfig.microsoftSignIn, async (ctx) => {
    const { redirect, connect, token } = ctx.req.valid('query');

    const state = generateState();
    const codeVerifier = generateCodeVerifier();
    const url = microsoftAuth.createAuthorizationURL(state, codeVerifier, microsoftScopes);

    return await createOauthSession(ctx, 'microsoft', url, state, codeVerifier, redirect, connect, token);
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

    // verify state
    if (!state || !stateCookie || !code || stateCookie !== state) {
      return errorResponse(ctx, 401, 'invalid_state', 'warn', undefined, { strategy });
    }

    const redirectExistingUserUrl = await getOauthRedirectUrl(ctx);

    try {
      const githubValidation = await githubAuth.validateAuthorizationCode(code);
      const accessToken = githubValidation.accessToken();

      // Get user info from github
      const githubUserResponse = await fetch('https://api.github.com/user', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const githubUser: githubUserProps = await githubUserResponse.json();

      // Check if it's account link
      const userId = await getAuthCookie(ctx, 'oauth_connect_user_id');

      // Check if oauth account already exists
      const existingStatus = await handleExistingOauthAccount(ctx, strategy, String(githubUser.id), userId || '');
      if (existingStatus === 'mismatch') return errorRedirect(ctx, 'oauth_mismatch', 'warn');
      if (existingStatus === 'auth') return ctx.redirect(redirectExistingUserUrl, 302);

      // Get user emails from github
      const githubUserEmailsResponse = await fetch('https://api.github.com/user/emails', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      const githubUserEmails: githubUserEmailProps[] = await githubUserEmailsResponse.json();

      const primaryEmail = githubUserEmails.find((email) => email.primary);
      if (!primaryEmail) return errorResponse(ctx, 401, 'no_email_found', 'warn');

      const slug = slugify(githubUser.login, { lower: true, strict: true });
      const { firstName, lastName } = splitFullName(githubUser.name || slug);

      // TODO: handle token  Check if user has an invite token
      const inviteToken = await getAuthCookie(ctx, 'oauth_invite_token');

      const userEmail = primaryEmail.email.toLowerCase();

      // Check if user already exists
      const conditions = [or(eq(usersTable.email, userEmail), ...(userId ? [eq(usersTable.id, userId)] : []))];
      const [existingUser] = await getUsersByConditions(conditions);

      if (existingUser) {
        const emailVerified = existingUser.emailVerified || !!inviteToken || primaryEmail.verified;
        return await updateExistingUser(ctx, existingUser, strategy, {
          providerUser: {
            id: String(githubUser.id),
            email: userEmail,
            thumbnailUrl: githubUser.avatar_url,
            firstName,
            lastName,
          },
          redirectUrl: redirectExistingUserUrl,
          emailVerified,
        });
      }

      const redirectNewUserUrl = await getOauthRedirectUrl(ctx, true);
      // Create new user and oauth account
      // TODO can we simplify this?
      const newUser = {
        slug: slugify(githubUser.login, { lower: true, strict: true }),
        email: userEmail,
        name: githubUser.name || githubUser.login,
        thumbnailUrl: githubUser.avatar_url,
        emailVerified: primaryEmail.verified,
        firstName,
        lastName,
      };
      return await handleCreateUser({
        ctx,
        redirectUrl: redirectNewUserUrl,
        provider: { id: strategy, userId: String(githubUser.id) },
        newUser,
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
  .openapi(authRouteConfig.googleSignInCallback, async (ctx) => {
    const { state, code } = ctx.req.valid('query');
    const strategy = 'google' as EnabledOauthProvider;

    if (!isOAuthEnabled(strategy)) {
      return errorResponse(ctx, 400, 'unsupported_oauth', 'warn', undefined, { strategy });
    }

    const storedState = await getAuthCookie(ctx, 'oauth_state');
    const storedCodeVerifier = await getAuthCookie(ctx, 'oauth_code_verifier');

    // verify state
    if (!code || !storedState || !storedCodeVerifier || state !== storedState) {
      return errorResponse(ctx, 401, 'invalid_state', 'warn', undefined, { strategy });
    }

    const redirectExistingUserUrl = await getOauthRedirectUrl(ctx);

    try {
      const googleValidation = await googleAuth.validateAuthorizationCode(code, storedCodeVerifier);
      const accessToken = googleValidation.accessToken();

      // Get user info from google
      const response = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const user: googleUserProps = await response.json();

      // Check if it's account link
      const userId = await getAuthCookie(ctx, 'oauth_connect_user_id');

      // Check if oauth account already exists
      const existingStatus = await handleExistingOauthAccount(ctx, strategy, user.sub, userId || '');
      if (existingStatus === 'mismatch') return errorRedirect(ctx, 'oauth_mismatch', 'warn');
      if (existingStatus === 'auth') return ctx.redirect(redirectExistingUserUrl, 302);

      // TODO: handle token  Check if user has an invite token
      const inviteToken = await getAuthCookie(ctx, 'oauth_invite_token');

      const userEmail = user.email.toLowerCase();

      // Check if user already exists
      const conditions = [or(eq(usersTable.email, userEmail), ...(userId ? [eq(usersTable.id, userId)] : []))];
      const [existingUser] = await getUsersByConditions(conditions);

      if (existingUser) {
        return await updateExistingUser(ctx, existingUser, strategy, {
          providerUser: {
            id: user.sub,
            email: userEmail,
            thumbnailUrl: user.picture,
            firstName: user.given_name,
            lastName: user.family_name,
          },
          redirectUrl: redirectExistingUserUrl,
          emailVerified: existingUser.emailVerified || !!inviteToken || user.email_verified,
        });
      }

      const redirectNewUserUrl = await getOauthRedirectUrl(ctx, true);
      // Create new user and oauth account
      const newUser = {
        slug: slugFromEmail(userEmail),
        email: userEmail,
        name: user.given_name,
        emailVerified: user.email_verified,
        thumbnailUrl: user.picture,
        firstName: user.given_name,
        lastName: user.family_name,
      };
      return await handleCreateUser({
        ctx,
        redirectUrl: redirectNewUserUrl,
        provider: { id: strategy, userId: user.sub },
        newUser,
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
  .openapi(authRouteConfig.microsoftSignInCallback, async (ctx) => {
    const { state, code } = ctx.req.valid('query');
    const strategy = 'microsoft' as EnabledOauthProvider;

    if (!isOAuthEnabled(strategy)) {
      return errorResponse(ctx, 400, 'unsupported_oauth', 'warn', undefined, { strategy });
    }

    const storedState = await getAuthCookie(ctx, 'oauth_state');
    const storedCodeVerifier = await getAuthCookie(ctx, 'oauth_code_verifier');

    // verify state
    if (!code || !storedState || !storedCodeVerifier || state !== storedState) {
      return errorResponse(ctx, 401, 'invalid_state', 'warn', undefined, { strategy });
    }

    const redirectExistingUserUrl = await getOauthRedirectUrl(ctx);

    try {
      const microsoftValidation = await microsoftAuth.validateAuthorizationCode(code, storedCodeVerifier);
      const accessToken = microsoftValidation.accessToken();

      // Get user info from microsoft
      const response = await fetch('https://graph.microsoft.com/oidc/userinfo', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const user: microsoftUserProps = await response.json();

      // Check if it's account link
      const userId = await getAuthCookie(ctx, 'oauth_connect_user_id');

      // Check if oauth account already exists
      const existingStatus = await handleExistingOauthAccount(ctx, strategy, user.sub, userId || '');
      if (existingStatus === 'mismatch') return errorRedirect(ctx, 'oauth_mismatch', 'warn');
      if (existingStatus === 'auth') return ctx.redirect(redirectExistingUserUrl, 302);

      // TODO: handle token  Check if user has an invite token
      const inviteToken = await getAuthCookie(ctx, 'oauth_invite_token');

      const userEmail = user.email?.toLowerCase();
      if (!userEmail) return errorResponse(ctx, 401, 'no_email_found', 'warn', undefined);

      // Check if user already exists
      const conditions = [or(eq(usersTable.email, userEmail), ...(userId ? [eq(usersTable.id, userId)] : []))];
      const [existingUser] = await getUsersByConditions(conditions);

      if (existingUser) {
        return await updateExistingUser(ctx, existingUser, strategy, {
          providerUser: {
            id: user.sub,
            email: userEmail,
            thumbnailUrl: user.picture,
            firstName: user.given_name,
            lastName: user.family_name,
          },
          redirectUrl: redirectExistingUserUrl,
          emailVerified: existingUser.emailVerified || !!inviteToken,
        });
      }

      const redirectNewUserUrl = await getOauthRedirectUrl(ctx, true);
      // Create new user and oauth account
      // TODO how to shorten this?
      const newUser = {
        slug: slugFromEmail(userEmail),
        email: userEmail,
        emailVerified: false,
        name: user.given_name,
        thumbnailUrl: user.picture,
        firstName: user.given_name,
        lastName: user.family_name,
      };

      return await handleCreateUser({
        ctx,
        newUser,
        redirectUrl: redirectNewUserUrl,
        provider: { id: strategy, userId: user.sub },
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
   * Passkey registration
   */
  .openapi(authRouteConfig.registerPasskey, async (ctx) => {
    const { attestationObject, clientDataJSON, userEmail } = ctx.req.valid('json');

    const challengeFromCookie = await getAuthCookie(ctx, 'passkey_challenge');
    if (!challengeFromCookie) return errorResponse(ctx, 401, 'invalid_credentials', 'error');

    const { credentialId, publicKey } = parseAndValidatePasskeyAttestation(clientDataJSON, attestationObject, challengeFromCookie);

    // Save public key in the database
    await db.insert(passkeysTable).values({ userEmail, credentialId, publicKey });

    return ctx.json({ success: true }, 200);
  })
  /*
   * Verify passkey
   */
  .openapi(authRouteConfig.verifyPasskey, async (ctx) => {
    const { clientDataJSON, authenticatorData, signature, userEmail } = ctx.req.valid('json');
    const strategy = 'passkey';

    // Retrieve user and challenge record
    // TODO why use email to find user?
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
