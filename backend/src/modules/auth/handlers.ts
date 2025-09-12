import { db } from '#/db/db';
import { emailsTable } from '#/db/schema/emails';
import { membershipsTable } from '#/db/schema/memberships';
import { organizationsTable } from '#/db/schema/organizations';
import { passkeysTable } from '#/db/schema/passkeys';
import { passwordsTable } from '#/db/schema/passwords';
import { sessionsTable } from '#/db/schema/sessions';
import { tokensTable } from '#/db/schema/tokens';
import { totpsTable } from '#/db/schema/totps';
import { type UserModel, usersTable } from '#/db/schema/users';
import { env } from '#/env';
import { type Env, getContextToken, getContextUser } from '#/lib/context';
import { resolveEntity } from '#/lib/entity';
import { AppError } from '#/lib/errors';
import { eventManager } from '#/lib/events';
import { mailer } from '#/lib/mailer';
import { hashPassword, verifyPasswordHash } from '#/modules/auth/helpers/argon2id';
import { deleteAuthCookie, getAuthCookie, setAuthCookie } from '#/modules/auth/helpers/cookie';
import { initiateMfa, validateConfirmMfaToken } from '#/modules/auth/helpers/mfa';
import { handleOAuthFlow } from '#/modules/auth/helpers/oauth/callback-flow';
import {
  githubAuth,
  type GithubUserEmailProps,
  type GithubUserProps,
  googleAuth,
  type GoogleUserProps,
  microsoftAuth,
  type MicrosoftUserProps,
} from '#/modules/auth/helpers/oauth/providers';
import { type OAuthCookiePayload, storeOAuthContext } from '#/modules/auth/helpers/oauth/session';
import { transformGithubUserData, transformSocialUserData } from '#/modules/auth/helpers/oauth/transform-user-data';
import { verifyPassKeyPublic } from '#/modules/auth/helpers/passkey';
import { sendVerificationEmail } from '#/modules/auth/helpers/send-verification-email';
import { getParsedSessionCookie, setUserSession, validateSession } from '#/modules/auth/helpers/session';
import { verifyTotp } from '#/modules/auth/helpers/totps';
import { handleCreateUser, handleMembershipTokenUpdate } from '#/modules/auth/helpers/user';
import authRoutes from '#/modules/auth/routes';
import { usersBaseQuery } from '#/modules/users/helpers/select';
import { defaultHook } from '#/utils/default-hook';
import { isExpiredDate } from '#/utils/is-expired-date';
import { isValidRedirectPath } from '#/utils/is-redirect-url';
import { getIsoDate } from '#/utils/iso-date';
import { logEvent } from '#/utils/logger';
import { nanoid } from '#/utils/nanoid';
import { slugFromEmail } from '#/utils/slug-from-email';
import { createDate, TimeSpan } from '#/utils/time-span';
import { getValidToken } from '#/utils/validate-token';
import { OpenAPIHono } from '@hono/zod-openapi';
import { encodeBase64 } from '@oslojs/encoding';
import { generateCodeVerifier, generateState, OAuth2RequestError } from 'arctic';
import { appConfig, type EnabledOAuthProvider } from 'config';
import { and, desc, eq, isNotNull, isNull } from 'drizzle-orm';
import i18n from 'i18next';
import { getRandomValues } from 'node:crypto';
import { CreatePasswordEmail, type CreatePasswordEmailProps } from '../../../emails/create-password';

const enabledStrategies: readonly string[] = appConfig.enabledAuthStrategies;
const enabledOAuthProviders: readonly string[] = appConfig.enabledOAuthProviders;

// Scopes for OAuth providers
const githubScopes = ['user:email'];
const googleScopes = ['profile', 'email'];
const microsoftScopes = ['profile', 'email'];

// When no microsoft tenant is configured, we use common with openid scope
if (!env.MICROSOFT_TENANT_ID) {
  microsoftScopes.push('openid');
}

// Check if oauth provider is enabled by appConfig
function isOAuthEnabled(provider: EnabledOAuthProvider): boolean {
  if (!enabledStrategies.includes('oauth')) return false;
  return enabledOAuthProviders.includes(provider);
}

const app = new OpenAPIHono<Env>({ defaultHook });

const authRouteHandlers = app
  /*
   * Check if email exists
   */
  .openapi(authRoutes.checkEmail, async (ctx) => {
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
          isNull(tokensTable.consumedAt),
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
   * Sign up with email & password.
   * Attention: sign up is also used for new users that received (system or membership) invitations.
   * Only when invited to a new organization (context), user will proceed to accept this first after signing up.
   */
  .openapi(authRoutes.signUp, async (ctx) => {
    const { email, password } = ctx.req.valid('json');

    // Verify if strategy allowed
    const strategy = 'password';
    if (!enabledStrategies.includes(strategy)) {
      throw new AppError({ status: 400, type: 'forbidden_strategy', severity: 'error', meta: { strategy } });
    }

    // Stop if sign up is disabled and no invitation
    if (!appConfig.has.registrationEnabled) throw new AppError({ status: 403, type: 'sign_up_restricted' });
    const slug = slugFromEmail(email);

    // Create user & send verification email
    const newUser = { slug, name: slug, email };

    const user = await handleCreateUser({ newUser });

    // Separatly insert password
    const hashedPassword = await hashPassword(password);
    await db.insert(passwordsTable).values({ userId: user.id, hashedPassword: hashedPassword });

    sendVerificationEmail({ userId: user.id });

    return ctx.json(true, 200);
  })
  /*
   * Sign up with email & password to accept (system or membership) invitations.
   * Only for organization membership invitations, user will proceed to accept after signing up.
   */
  .openapi(authRoutes.signUpWithToken, async (ctx) => {
    const { password } = ctx.req.valid('json');

    const validToken = getContextToken();
    if (!validToken) throw new AppError({ status: 400, type: 'invalid_request', severity: 'error' });

    const membershipInvite = !!validToken.entityType;
    // Verify if strategy allowed
    const strategy = 'password';
    if (!enabledStrategies.includes(strategy)) {
      throw new AppError({ status: 400, type: 'forbidden_strategy', severity: 'error', meta: { strategy } });
    }

    // add token if it's membership invitation
    const membershipInviteTokenId = membershipInvite ? validToken.id : undefined;
    const slug = slugFromEmail(validToken.email);

    // Create user & send verification email
    const newUser = { slug, name: slug, email: validToken.email };

    const user = await handleCreateUser({ newUser, membershipInviteTokenId, emailVerified: true });

    // Separately insert password
    const hashedPassword = await hashPassword(password);
    await db.insert(passwordsTable).values({ userId: user.id, hashedPassword: hashedPassword });

    // Sign in user
    await setUserSession(ctx, user, strategy);

    const redirectPath = membershipInvite ? `/invitation/${validToken.token}` : appConfig.defaultRedirectPath;
    return ctx.json({ shouldRedirect: true, redirectPath }, 200);
  })
  /*
   * Verify email
   */
  .openapi(authRoutes.verifyEmail, async (ctx) => {
    const { redirect } = ctx.req.valid('query');

    // No token in context
    const token = getContextToken();
    if (!token.userId) throw new AppError({ status: 400, type: 'invalid_request', severity: 'error' });

    // Only allow verify emails for "password" strategy (Oauth verification is handled by Oauth callback handlers)
    if (token.oauthAccountId) {
      throw new AppError({ status: 400, type: 'invalid_request', severity: 'error' });
    }

    // Get user
    const [user] = await usersBaseQuery().where(eq(usersTable.id, token.userId)).limit(1);

    // User not found
    if (!user) {
      throw new AppError({ status: 404, type: 'not_found', severity: 'warn', entityType: 'user', meta: { userId: token.userId } });
    }

    // Set email verified if it exists
    await db
      .update(emailsTable)
      .set({ verified: true, verifiedAt: getIsoDate() })
      .where(
        and(
          eq(emailsTable.tokenId, token.id),
          eq(emailsTable.userId, token.userId),
          eq(emailsTable.email, token.email),
          eq(emailsTable.verified, false),
        ),
      );

    // Start MFA challenge if the user has MFA enabled
    const mfaRedirectPath = await initiateMfa(ctx, user);

    // Determine redirect url
    const decodedRedirect = decodeURIComponent(redirect || '');
    const baseRedirectPath = isValidRedirectPath(decodedRedirect) || appConfig.defaultRedirectPath;

    const redirectPath = mfaRedirectPath || baseRedirectPath;
    const redirectUrl = new URL(redirectPath, appConfig.frontendUrl);

    // If MFA is not required, set  user session immediately
    if (!mfaRedirectPath) await setUserSession(ctx, user, 'email');

    return ctx.redirect(redirectUrl, 302);
  })
  /*
   * Request reset password email
   */
  .openapi(authRoutes.requestPassword, async (ctx) => {
    const { email } = ctx.req.valid('json');

    const normalizedEmail = email.toLowerCase().trim();

    const [user] = await usersBaseQuery()
      .leftJoin(emailsTable, eq(usersTable.id, emailsTable.userId))
      .where(eq(emailsTable.email, normalizedEmail))
      .limit(1);
    if (!user) throw new AppError({ status: 404, type: 'invalid_email', severity: 'warn', entityType: 'user' });

    // Delete old token if exists
    await db.delete(tokensTable).where(and(eq(tokensTable.userId, user.id), eq(tokensTable.type, 'password_reset')));

    const [tokenRecord] = await db
      .insert(tokensTable)
      .values({
        token: nanoid(40),
        type: 'password_reset',
        userId: user.id,
        email,
        createdBy: user.id,
        expiresAt: createDate(new TimeSpan(2, 'h')),
      })
      .returning();

    // Send email
    const lng = user.language;
    const createPasswordLink = `${appConfig.frontendUrl}/auth/create-password/${tokenRecord.token}`;
    const subject = i18n.t('backend:email.create_password.subject', { lng, appName: appConfig.name });
    const staticProps = { createPasswordLink, subject, lng };
    const recipients = [{ email: user.email }];

    type Recipient = { email: string };

    mailer.prepareEmails<CreatePasswordEmailProps, Recipient>(CreatePasswordEmail, staticProps, recipients);

    logEvent('info', 'Create password link sent', { userId: user.id });

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
      throw new AppError({ status: 400, type: 'forbidden_strategy', severity: 'error', meta: { strategy } });
    }

    // If the token is not found or expired
    if (!token || !token.userId) throw new AppError({ status: 401, type: 'invalid_token', severity: 'warn' });

    const [user] = await usersBaseQuery().where(eq(usersTable.id, token.userId)).limit(1);

    // If the user is not found
    if (!user) {
      throw new AppError({ status: 404, type: 'not_found', severity: 'warn', entityType: 'user', meta: { userId: token.userId } });
    }

    // Hash password
    const hashedPassword = await hashPassword(password);

    // update user password and set email verified
    await Promise.all([
      db.update(passwordsTable).set({ hashedPassword }).where(eq(passwordsTable.userId, user.id)),
      db.update(emailsTable).set({ verified: true, verifiedAt: getIsoDate() }).where(eq(emailsTable.email, user.email)),
    ]);

    const redirectPath = await initiateMfa(ctx, user);
    if (redirectPath) return ctx.json({ shouldRedirect: true, redirectPath }, 200);

    await setUserSession(ctx, user, strategy);
    return ctx.json({ shouldRedirect: false }, 200);
  })
  /*
   * Sign in with email and password
   * Attention: sign in is also used as a preparation to accept organization invitations (when signed out & user exists),
   * after signing in, we proceed to accept the invitation.
   */
  .openapi(authRoutes.signIn, async (ctx) => {
    const { email, password } = ctx.req.valid('json');

    // Verify if strategy allowed
    const strategy = 'password';
    if (!enabledStrategies.includes(strategy)) {
      throw new AppError({ status: 400, type: 'forbidden_strategy', severity: 'error', meta: { strategy } });
    }

    const normalizedEmail = email.toLowerCase().trim();

    const [info] = await db
      .select({ user: usersTable, hashedPassword: passwordsTable.hashedPassword, emailVerified: emailsTable.verified })
      .from(usersTable)
      .innerJoin(emailsTable, eq(usersTable.id, emailsTable.userId))
      .leftJoin(passwordsTable, eq(usersTable.id, passwordsTable.userId))
      .where(eq(emailsTable.email, normalizedEmail))
      .limit(1);

    // If user is not found or doesn't have password
    if (!info) throw new AppError({ status: 404, type: 'not_found', severity: 'warn', entityType: 'user' });

    const { user, hashedPassword, emailVerified } = info;

    if (!hashedPassword) throw new AppError({ status: 403, type: 'no_password_found', severity: 'warn' });
    // Verify password
    const validPassword = await verifyPasswordHash(hashedPassword, password);
    if (!validPassword) throw new AppError({ status: 403, type: 'invalid_password', severity: 'warn' });

    // If email is not verified, send verification email
    if (!emailVerified) {
      sendVerificationEmail({ userId: user.id });
      return ctx.json({ shouldRedirect: true, redirectPath: '/auth/email-verification/signin' }, 200);
    }

    const redirectPath = await initiateMfa(ctx, user);
    if (redirectPath) return ctx.json({ shouldRedirect: true, redirectPath }, 200);

    await setUserSession(ctx, user, 'password');
    return ctx.json({ shouldRedirect: false }, 200);
  })
  /*
   * Check token (token validation)
   */
  .openapi(authRoutes.validateToken, async (ctx) => {
    // Find token in request
    const { token } = ctx.req.valid('param');
    const { type: requiredType } = ctx.req.valid('query');

    // Check if token exists
    const tokenRecord = await getValidToken({ requiredType, token, consumeToken: false });

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
   * Accept org invite token for signed in users
   */
  .openapi(authRoutes.acceptEntityInvite, async (ctx) => {
    const user = getContextUser();
    const token = getContextToken();

    // Make sure its an organization invitation
    if (!token.entityType) throw new AppError({ status: 401, type: 'invalid_token', severity: 'warn' });

    const [emailData] = await db.select().from(emailsTable).where(eq(emailsTable.email, token.email));
    // Make sure correct user accepts invitation (for example another user could have a sessions and click on email invite of another user)
    if (user.id !== token.userId && (!emailData || emailData.userId !== user.id)) {
      throw new AppError({ status: 401, type: 'user_mismatch', severity: 'warn' });
    }

    // If userId is not yet set on token, handle membership token update
    if (emailData.userId === user.id && user.id !== token.userId) await handleMembershipTokenUpdate(user.id, token.id);

    // Activate memberships
    const activatedMemberships = await db
      .update(membershipsTable)
      .set({ tokenId: null, activatedAt: getIsoDate() })
      .where(and(eq(membershipsTable.tokenId, token.id)))
      .returning();

    const [targetMembership] = activatedMemberships.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const entityIdField = appConfig.entityIdFields[token.entityType];
    if (!targetMembership[entityIdField]) throw new AppError({ status: 404, type: 'not_found', severity: 'warn', entityType: token.entityType });

    const entity = await resolveEntity(token.entityType, targetMembership[entityIdField]);
    if (!entity) throw new AppError({ status: 404, type: 'not_found', severity: 'warn', entityType: token.entityType });

    eventManager.emit('acceptedMembership', targetMembership);

    return ctx.json({ ...entity, membership: targetMembership }, 200);
  })
  /*
   * Start impersonation
   */
  .openapi(authRoutes.startImpersonation, async (ctx) => {
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
  .openapi(authRoutes.stopImpersonation, async (ctx) => {
    const { sessionToken, adminUserId } = await getParsedSessionCookie(ctx, { deleteAfterAttempt: true });
    const { session } = await validateSession(sessionToken);

    if (adminUserId) {
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
    }

    logEvent('info', 'Stopped impersonation', { adminId: adminUserId || 'na', targetUserId: session.userId });

    return ctx.json(true, 200);
  })
  /*
   * Sign out
   */
  .openapi(authRoutes.signOut, async (ctx) => {
    const confirmMfa = await getAuthCookie(ctx, 'confirm-mfa');

    if (confirmMfa) {
      // Delete mfa cookie
      deleteAuthCookie(ctx, 'confirm-mfa');

      logEvent('info', 'User mfa canceled');

      return ctx.json(true, 200);
    }

    // Find session & invalidate
    const { sessionToken } = await getParsedSessionCookie(ctx, { deleteOnError: true, deleteAfterAttempt: true });
    const { session: currentSession } = await validateSession(sessionToken);

    await db.delete(sessionsTable).where(and(eq(sessionsTable.id, currentSession.id), eq(sessionsTable.userId, currentSession.userId)));

    logEvent('info', 'User signed out', { userId: currentSession.userId });

    return ctx.json(true, 200);
  })
  /*
   * Initiates GitHub OAuth authentication flow
   */
  .openapi(authRoutes.github, async (ctx) => {
    // Generate a `state` to prevent CSRF, and build URL with scope.
    const state = generateState();
    const url = githubAuth.createAuthorizationURL(state, githubScopes);

    // Start the OAuth session & flow (Persist `state`)
    return await storeOAuthContext(ctx, 'github', url, state);
  })
  /*
   * Initiates Google OAuth authentication flow
   */
  .openapi(authRoutes.google, async (ctx) => {
    // Generate a `state`, PKCE, and scoped URL.
    const state = generateState();
    const codeVerifier = generateCodeVerifier();
    const url = googleAuth.createAuthorizationURL(state, codeVerifier, googleScopes);

    // Start the OAuth session & flow (Persist `state` and `codeVerifier`)
    return await storeOAuthContext(ctx, 'google', url, state, codeVerifier);
  })
  /*
   * Initiates Microsoft OAuth authentication flow
   */
  .openapi(authRoutes.microsoft, async (ctx) => {
    // Generate a `state`, PKCE, and scoped URL.
    const state = generateState();
    const codeVerifier = generateCodeVerifier();
    const url = microsoftAuth.createAuthorizationURL(state, codeVerifier, microsoftScopes);

    // Start the OAuth session & flow (Persist `state` and `codeVerifier`)
    return await storeOAuthContext(ctx, 'microsoft', url, state, codeVerifier);
  })

  /*
   * GitHub authentication callback handler
   */
  .openapi(authRoutes.githubCallback, async (ctx) => {
    const { code, state, error } = ctx.req.valid('query');

    /*
     * Handle custom redirect flow (e.g., for external apps or tools):
     * If `state` includes a `redirectUrl`, redirect there with OAuth params.
     * Falls back silently if `state` is not a JSON-encoded object.
     */
    try {
      const parsedState = JSON.parse(atob(state));
      if (parsedState.redirectUrl) return ctx.redirect(`${parsedState.redirectUrl}?code=${code}&state=${state}&error=${error}`, 302);
    } catch (_) {
      // Ignore parsing errors; continue with standard OAuth handling
    }

    // When something went wrong during Github OAuth, fail early.
    if (error || !code) {
      throw new AppError({ status: 400, type: 'oauth_failed', severity: 'warn', isRedirect: true });
    }

    // Check if Github OAuth is enabled
    const strategy = 'github' as EnabledOAuthProvider;

    if (!isOAuthEnabled(strategy)) {
      throw new AppError({ status: 400, type: 'unsupported_oauth', severity: 'error', meta: { strategy }, isRedirect: true });
    }

    // Verify cookie by `state` (CSRF protection)
    const oauthCookie = await getAuthCookie(ctx, `oauth-${state}`);
    const cookiePayload: OAuthCookiePayload | null = oauthCookie ? JSON.parse(oauthCookie) : null;

    if (!state || !cookiePayload) {
      throw new AppError({ status: 401, type: 'invalid_state', severity: 'warn', meta: { strategy }, isRedirect: true });
    }

    try {
      // Exchange authorization code for access token and fetch Github user info
      const githubValidation = await githubAuth.validateAuthorizationCode(code);
      const accessToken = githubValidation.accessToken();

      const headers = { Authorization: `Bearer ${accessToken}` };
      const [githubUserResponse, githubUserEmailsResponse] = await Promise.all([
        fetch('https://api.github.com/user', { headers }),
        fetch('https://api.github.com/user/emails', { headers }),
      ]);

      const githubUser = (await githubUserResponse.json()) as GithubUserProps;
      const githubUserEmails = (await githubUserEmailsResponse.json()) as GithubUserEmailProps[];
      const providerUser = transformGithubUserData(githubUser, githubUserEmails);

      return await handleOAuthFlow(ctx, providerUser, strategy, cookiePayload);
    } catch (error) {
      if (error instanceof AppError) throw error;

      // Handle known OAuth validation errors (e.g. bad token, revoked code)
      const type = error instanceof OAuth2RequestError ? 'invalid_credentials' : 'oauth_failed';
      throw new AppError({
        status: 401,
        type,
        severity: 'warn',
        meta: { strategy },
        isRedirect: true,
        ...(error instanceof Error ? { originalError: error } : {}),
      });
    }
  })

  /*
   * Google authentication callback handler
   */
  .openapi(authRoutes.googleCallback, async (ctx) => {
    const { state, code } = ctx.req.valid('query');

    // Check if Google OAuth is enabled
    const strategy = 'google' as EnabledOAuthProvider;
    if (!isOAuthEnabled(strategy)) {
      throw new AppError({ status: 400, type: 'unsupported_oauth', severity: 'error', meta: { strategy }, isRedirect: true });
    }

    // Verify cookie by `state` (CSRF protection) & PKCE validation
    const oauthCookie = await getAuthCookie(ctx, `oauth-${state}`);
    const cookiePayload: OAuthCookiePayload | null = oauthCookie ? JSON.parse(oauthCookie) : null;

    if (!code || !cookiePayload || !cookiePayload.codeVerifier) {
      throw new AppError({ status: 401, type: 'invalid_state', severity: 'warn', meta: { strategy }, isRedirect: true });
    }

    try {
      // Exchange authorization code for access token and fetch Google user info
      const googleValidation = await googleAuth.validateAuthorizationCode(code, cookiePayload.codeVerifier);
      const accessToken = googleValidation.accessToken();

      const headers = { Authorization: `Bearer ${accessToken}` };
      const response = await fetch('https://openidconnect.googleapis.com/v1/userinfo', { headers });
      const googleUser = (await response.json()) as GoogleUserProps;
      const providerUser = transformSocialUserData(googleUser);

      return await handleOAuthFlow(ctx, providerUser, strategy, cookiePayload);
    } catch (error) {
      if (error instanceof AppError) throw error;

      // Handle known OAuth validation errors (e.g. bad token, revoked code)
      const type = error instanceof OAuth2RequestError ? 'invalid_credentials' : 'oauth_failed';
      throw new AppError({
        status: 401,
        type,
        severity: 'warn',
        meta: { strategy },
        isRedirect: true,
        ...(error instanceof Error ? { originalError: error } : {}),
      });
    }
  })

  /*
   * Microsoft authentication callback handler
   */
  .openapi(authRoutes.microsoftCallback, async (ctx) => {
    const { state, code } = ctx.req.valid('query');

    // Check if Microsoft OAuth is enabled
    const strategy = 'microsoft' as EnabledOAuthProvider;
    if (!isOAuthEnabled(strategy)) {
      throw new AppError({ status: 400, type: 'unsupported_oauth', severity: 'error', meta: { strategy }, isRedirect: true });
    }

    // Verify cookie by `state` (CSRF protection) & PKCE validation
    const oauthCookie = await getAuthCookie(ctx, `oauth-${state}`);
    const cookiePayload: OAuthCookiePayload | null = oauthCookie ? JSON.parse(oauthCookie) : null;

    if (!code || !cookiePayload || !cookiePayload.codeVerifier) {
      throw new AppError({ status: 401, type: 'invalid_state', severity: 'warn', meta: { strategy }, isRedirect: true });
    }

    try {
      // Exchange authorization code for access token and fetch Microsoft user info
      const microsoftValidation = await microsoftAuth.validateAuthorizationCode(code, cookiePayload.codeVerifier);
      const accessToken = microsoftValidation.accessToken();

      const headers = { Authorization: `Bearer ${accessToken}` };
      const response = await fetch('https://graph.microsoft.com/oidc/userinfo', { headers });
      const microsoftUser = (await response.json()) as MicrosoftUserProps;
      const providerUser = transformSocialUserData(microsoftUser);

      return await handleOAuthFlow(ctx, providerUser, strategy, cookiePayload);
    } catch (error) {
      if (error instanceof AppError) throw error;

      // Handle known OAuth validation errors (e.g. bad token, revoked code)
      const type = error instanceof OAuth2RequestError ? 'invalid_credentials' : 'oauth_failed';
      throw new AppError({
        status: 401,
        type,
        severity: 'warn',
        meta: { strategy },
        isRedirect: true,
        ...(error instanceof Error ? { originalError: error } : {}),
      });
    }
  })
  /*
   * Passkey challenge
   */
  .openapi(authRoutes.getPasskeyChallenge, async (ctx) => {
    const { email, type } = ctx.req.valid('query');

    let userEmail: string | null = null;

    // Generate a 32-byte random challenge and encode it as Base64
    const challenge = getRandomValues(new Uint8Array(32));
    const challengeBase64 = encodeBase64(challenge);

    // Save the challenge in a short-lived cookie (5 minutes)
    await setAuthCookie(ctx, 'passkey-challenge', challengeBase64, new TimeSpan(5, 'm'));

    // Normalize email if provided
    if (email) {
      userEmail = email.toLowerCase().trim();
    }

    // If this is a multifactor request, retrieve user from pending MFA token
    if (type === 'mfa') {
      const { email: tokenEmail } = await validateConfirmMfaToken(ctx, false);
      userEmail = tokenEmail;
    }

    // If we still have no email, return challenge with empty credential list
    if (!userEmail) return ctx.json({ challengeBase64, credentialIds: [] }, 200);

    // Fetch all passkey credentials for this user
    const credentials = await db
      .select({ credentialId: passkeysTable.credentialId })
      .from(passkeysTable)
      .where(eq(passkeysTable.userEmail, userEmail));

    const credentialIds = credentials.map((c) => c.credentialId);

    return ctx.json({ challengeBase64, credentialIds }, 200);
  })
  /*
   * Verify passkey
   */
  .openapi(authRoutes.signInWithPasskey, async (ctx) => {
    const { clientDataJSON, authenticatorData, signature, credentialId, email, type } = ctx.req.valid('json');
    const strategy = 'passkey';

    if (type === 'authentication' && !enabledStrategies.includes(strategy)) {
      throw new AppError({ status: 400, type: 'forbidden_strategy', severity: 'error', meta: { strategy } });
    }
    // Determine session type: regular authentication or MFA
    const sessionType = type === 'mfa' ? 'mfa' : 'regular';

    let user: UserModel | null = null;

    // Find user by email if provided
    if (email) {
      const normalizedEmail = email.toLowerCase().trim();

      const [tableUser] = await usersBaseQuery()
        .leftJoin(emailsTable, eq(usersTable.id, emailsTable.userId))
        .where(eq(emailsTable.email, normalizedEmail))
        .limit(1);

      user = tableUser;
    }

    // Override user if this is a multifactor authentication
    if (type === 'mfa') {
      const userFromToken = await validateConfirmMfaToken(ctx);
      user = userFromToken;
    }

    const meta = { strategy, sessionType };

    // Fail early if user not found
    if (!user) throw new AppError({ status: 404, type: 'not_found', severity: 'warn', entityType: 'user', meta });

    // Retrieve the passkey challenge from cookie
    const challengeFromCookie = await getAuthCookie(ctx, 'passkey-challenge');
    if (!challengeFromCookie) throw new AppError({ status: 401, type: 'invalid_credentials', severity: 'warn', meta });

    // Get passkey credentials
    const [passkeyRecord] = await db
      .select()
      .from(passkeysTable)
      .where(and(eq(passkeysTable.userEmail, user.email), eq(passkeysTable.credentialId, credentialId)))
      .limit(1);

    if (!passkeyRecord) throw new AppError({ status: 404, type: 'passkey_not_found', severity: 'warn', meta });

    try {
      const isValid = await verifyPassKeyPublic(signature, authenticatorData, clientDataJSON, passkeyRecord.publicKey, challengeFromCookie);
      if (!isValid) throw new AppError({ status: 401, type: 'invalid_token', severity: 'warn', meta });
    } catch (error) {
      if (error instanceof AppError) throw error;

      throw new AppError({
        status: 500,
        type: 'passkey_verification_failed',
        severity: 'error',
        meta,
        ...(error instanceof Error ? { originalError: error } : {}),
      });
    }

    return ctx.json(true, 200);
  })
  /*
   * Verify TOTP
   */
  .openapi(authRoutes.verifyTotp, async (ctx) => {
    const { code } = ctx.req.valid('json');

    const strategy = 'totp';
    const sessionType = 'mfa';

    const meta = { strategy, sessionType };
    const user = await validateConfirmMfaToken(ctx);

    // Get totp credentials
    const [credentials] = await db.select().from(totpsTable).where(eq(totpsTable.userId, user.id)).limit(1);
    if (!credentials) throw new AppError({ status: 404, type: 'not_found', severity: 'warn', meta });

    try {
      const isValid = verifyTotp(code, credentials.encoderSecretKey);
      if (!isValid) throw new AppError({ status: 401, type: 'invalid_token', severity: 'warn', meta });
    } catch (error) {
      if (error instanceof AppError) throw error;

      throw new AppError({
        status: 500,
        type: 'totp_verification_failed',
        severity: 'error',
        meta,
        ...(error instanceof Error ? { originalError: error } : {}),
      });
    }

    // Set user session after successful verification
    await setUserSession(ctx, user, strategy, sessionType);

    return ctx.json(true, 200);
  });
export default authRouteHandlers;
