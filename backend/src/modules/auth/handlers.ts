import { getRandomValues } from 'node:crypto';
import { OpenAPIHono } from '@hono/zod-openapi';
import { encodeBase64 } from '@oslojs/encoding';
import { generateCodeVerifier, generateState, OAuth2RequestError } from 'arctic';
import { appConfig, type EnabledOAuthProvider } from 'config';
import { and, desc, eq, isNotNull, isNull } from 'drizzle-orm';
import i18n from 'i18next';
import { db } from '#/db/db';
import { emailsTable } from '#/db/schema/emails';
import { membershipsTable } from '#/db/schema/memberships';
import { oauthAccountsTable } from '#/db/schema/oauth-accounts';
import { organizationsTable } from '#/db/schema/organizations';
import { passkeysTable } from '#/db/schema/passkeys';
import { sessionsTable } from '#/db/schema/sessions';
import { tokensTable } from '#/db/schema/tokens';
import { usersTable } from '#/db/schema/users';
import { env } from '#/env';
import { type Env, getContextToken, getContextUser } from '#/lib/context';
import { resolveEntity } from '#/lib/entity';
import { AppError } from '#/lib/errors';
import { eventManager } from '#/lib/events';
import { mailer } from '#/lib/mailer';
import { sendSSEToUsers } from '#/lib/sse';
import { hashPassword, verifyPasswordHash } from '#/modules/auth/helpers/argon2id';
import { deleteAuthCookie, getAuthCookie, setAuthCookie } from '#/modules/auth/helpers/cookie';
import {
  clearOAuthSession,
  createOAuthSession,
  getOAuthCookies,
  handleOAuthConnection,
  handleOAuthInvitation,
  setOAuthRedirect,
} from '#/modules/auth/helpers/oauth/cookies';
import { basicFlow, connectFlow, getOAuthAccount, inviteFlow } from '#/modules/auth/helpers/oauth/index';
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
import { sendVerificationEmail } from '#/modules/auth/helpers/send-verification-email';
import { getParsedSessionCookie, invalidateSessionById, setUserSession, validateSession } from '#/modules/auth/helpers/session';
import { handleCreateUser, handleMembershipTokenUpdate } from '#/modules/auth/helpers/user';
import authRoutes from '#/modules/auth/routes';
import { getUserBy } from '#/modules/users/helpers/get-user-by';
import { userSelect } from '#/modules/users/helpers/select';
import { defaultHook } from '#/utils/default-hook';
import { isExpiredDate } from '#/utils/is-expired-date';
import { isValidRedirectPath } from '#/utils/is-redirect-url';
import { getIsoDate } from '#/utils/iso-date';
import { logEvent } from '#/utils/logger';
import { nanoid } from '#/utils/nanoid';
import { slugFromEmail } from '#/utils/slug-from-email';
import { createDate, TimeSpan } from '#/utils/time-span';
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
      .where(and(eq(tokensTable.email, normalizedEmail), eq(tokensTable.type, 'invitation'), isNull(tokensTable.userId)));

    if (inviteToken) throw new AppError({ status: 403, type: 'invite_takes_priority', severity: 'warn' });

    // User not found, go to sign up if registration is enabled
    const user = await getUserBy('email', normalizedEmail);
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
    const hashedPassword = await hashPassword(password);
    const slug = slugFromEmail(email);

    // Create user & send verification email
    const newUser = { slug, name: slug, email, hashedPassword };

    const user = await handleCreateUser({ newUser });

    sendVerificationEmail({ userId: user.id });

    return ctx.json(true, 200);
  })
  /*
   * Sign up with email & password to accept (system or membership) invitations.
   * Only for membership invitations, user will proceed to accept after signing up.
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

    // Delete token to not needed anymore (if no membership invitation)
    if (!membershipInvite) await db.delete(tokensTable).where(eq(tokensTable.id, validToken.id));

    // add token if it's membership invitation
    const membershipInviteTokenId = membershipInvite ? validToken.id : undefined;
    const hashedPassword = await hashPassword(password);
    const slug = slugFromEmail(validToken.email);

    // Create user & send verification email
    const newUser = { slug, name: slug, email: validToken.email, hashedPassword };

    const user = await handleCreateUser({ newUser, membershipInviteTokenId, emailVerified: true });

    await setUserSession(ctx, user, 'password');

    // Return
    return ctx.json(true, 200);
  })
  /*
   * Resend invitation email, also used to resend verification email.
   */
  .openapi(authRoutes.resendInvitation, async (ctx) => {
    const { email, tokenId } = ctx.req.valid('json');

    const normalizedEmail = email.toLowerCase().trim();

    // Get user by email
    const user = await getUserBy('email', normalizedEmail);
    if (!user) throw new AppError({ status: 404, type: 'not_found', severity: 'warn', entityType: 'user' });

    // Find token by userId and if available also tokenId
    const filters = [eq(tokensTable.type, 'invitation'), eq(tokensTable.userId, user.id)];
    if (tokenId) filters.push(eq(tokensTable.id, tokenId));

    // Get token
    const [tokenRecord] = await db
      .select()
      .from(tokensTable)
      .where(and(...filters));
    if (!tokenRecord || !tokenRecord.userId) throw new AppError({ status: 404, type: 'not_found', severity: 'warn' });

    // TODO add function that creates and sends invitation email with existing token and tokenId. However, if token is beyond 50% expired, it should remove the old token and create a new token and send it.

    // Return
    return ctx.json(true, 200);
  })
  /*
   * Verify email
   */
  .openapi(authRoutes.verifyEmail, async (ctx) => {
    const { redirect } = ctx.req.valid('query');

    const decodedRedirect = decodeURIComponent(redirect || '');
    const redirectPath = isValidRedirectPath(decodedRedirect) || appConfig.defaultRedirectPath;

    // No token in context
    const token = getContextToken();
    if (!token || !token.userId) throw new AppError({ status: 400, type: 'invalid_request', severity: 'error' });

    // Get user
    const [user] = await db
      .select({ ...userSelect })
      .from(usersTable)
      .where(eq(usersTable.id, token.userId));

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

    // Verify oauthAccount if linked in verification token. Also add email to emails table if not exists
    if (token.oauthAccountId) {
      await db
        .update(oauthAccountsTable)
        .set({ verified: true, verifiedAt: getIsoDate() })
        .where(
          and(
            eq(oauthAccountsTable.id, token.oauthAccountId),
            eq(oauthAccountsTable.userId, token.userId),
            eq(oauthAccountsTable.email, token.email),
          ),
        );

      // Add email to emails table if it doesn't exist
      await db
        .insert(emailsTable)
        .values({ email: token.email, userId: token.userId, verified: true, verifiedAt: getIsoDate() })
        .onConflictDoNothing();
    }

    // Delete token(s) to prevent reuse
    await db.delete(tokensTable).where(eq(tokensTable.id, token.id));

    // Sign in user
    await setUserSession(ctx, user, 'email');

    const redirectUrl = new URL(redirectPath, appConfig.frontendUrl);

    return ctx.redirect(redirectUrl, 302);
  })
  /*
   * Request reset password email
   */
  .openapi(authRoutes.requestPassword, async (ctx) => {
    const { email } = ctx.req.valid('json');

    const normalizedEmail = email.toLowerCase().trim();

    const user = await getUserBy('email', normalizedEmail);
    if (!user) throw new AppError({ status: 404, type: 'invalid_email', severity: 'warn', entityType: 'user' });

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
    const createPasswordLink = `${appConfig.frontendUrl}/auth/create-password/${token}?tokenId=${tokenRecord.id}`;
    const subject = i18n.t('backend:email.create_password.subject', { lng, appName: appConfig.name });
    const staticProps = { createPasswordLink, subject, lng };
    const recipients = [{ email: user.email }];

    type Recipient = { email: string };

    mailer.prepareEmails<CreatePasswordEmailProps, Recipient>(CreatePasswordEmail, staticProps, recipients);

    logEvent({ msg: 'Create password link sent', meta: { user: user.id } });

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

    // Delete token to prevent reuse
    await db.delete(tokensTable).where(and(eq(tokensTable.id, token.id), eq(tokensTable.type, 'password_reset')));

    const user = await getUserBy('id', token.userId);

    // If the user is not found
    if (!user) {
      throw new AppError({ status: 404, type: 'not_found', severity: 'warn', entityType: 'user', meta: { userId: token.userId } });
    }

    // Hash password
    const hashedPassword = await hashPassword(password);

    // update user password and set email verified
    await Promise.all([
      db.update(usersTable).set({ hashedPassword }).where(eq(usersTable.id, user.id)),
      db.update(emailsTable).set({ verified: true, verifiedAt: getIsoDate() }).where(eq(emailsTable.email, user.email)),
    ]);

    // Sign in user
    await setUserSession(ctx, user, 'password');

    return ctx.json(true, 200);
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

    const [user, [emailData]] = await Promise.all([
      getUserBy('email', normalizedEmail, 'unsafe'),
      db.select().from(emailsTable).where(eq(emailsTable.email, normalizedEmail)),
    ]);

    // If user is not found or doesn't have password
    if (!user) throw new AppError({ status: 404, type: 'not_found', severity: 'warn', entityType: 'user' });
    if (!user.hashedPassword) throw new AppError({ status: 403, type: 'no_password_found', severity: 'warn' });

    // Verify password
    const validPassword = await verifyPasswordHash(user.hashedPassword, password);
    if (!validPassword) throw new AppError({ status: 403, type: 'invalid_password', severity: 'warn' });

    // If email is not verified, send verification email
    if (!emailData.verified) sendVerificationEmail({ userId: user.id });
    // Sign in user
    else await setUserSession(ctx, user, 'password');

    return ctx.json(emailData.verified, 200);
  })
  /*
   * Check token (token validation)
   */
  .openapi(authRoutes.refreshToken, async (ctx) => {
    // Find token in request
    const { id } = ctx.req.valid('param');
    const { type } = ctx.req.valid('query');

    // Check if token exists
    const [tokenRecord] = await db.select().from(tokensTable).where(eq(tokensTable.id, id));
    if (!tokenRecord) throw new AppError({ status: 404, type: `${type}_not_found`, severity: 'warn' });

    // If token is expired, return an error
    if (isExpiredDate(tokenRecord.expiresAt)) throw new AppError({ status: 401, type: `${type}_expired`, severity: 'warn' });

    const baseData = {
      email: tokenRecord.email,
      role: tokenRecord.role,
      userId: tokenRecord.userId || '',
    };

    // If its NOT an organization invitation, return base data
    if (!tokenRecord.organizationId) return ctx.json(baseData, 200);

    // If it is a membership invitation, check if a new user has been created since invitation was sent (without verifying email)
    const [existingUser] = await db.select().from(usersTable).where(eq(usersTable.email, tokenRecord.email));
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

    // Delete token after all activation, since tokenId is cascaded in membershipTable
    await db.delete(tokensTable).where(eq(tokensTable.id, token.id));

    const entityIdField = appConfig.entityIdFields[token.entityType];
    if (!targetMembership[entityIdField]) throw new AppError({ status: 404, type: 'not_found', severity: 'warn', entityType: token.entityType });

    const entity = await resolveEntity(token.entityType, targetMembership[entityIdField]);
    if (!entity) throw new AppError({ status: 404, type: 'not_found', severity: 'warn', entityType: token.entityType });

    eventManager.emit('acceptedMembership', targetMembership);

    // Add event only for admins, which entity not archived, since only they can see pending invites
    const adminMembers = await db
      .select()
      .from(membershipsTable)
      .where(
        and(
          eq(membershipsTable.contextType, entity.entityType),
          eq(membershipsTable.role, 'admin'),
          eq(membershipsTable[entityIdField], entity.id),
          eq(membershipsTable.archived, false),
          isNotNull(membershipsTable.activatedAt),
        ),
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

    const [user] = await db
      .select({ ...userSelect })
      .from(usersTable)
      .where(eq(usersTable.id, targetUserId));

    if (!user) {
      throw new AppError({ status: 404, type: 'not_found', severity: 'warn', entityType: 'user', meta: { userId: targetUserId } });
    }

    const adminUser = getContextUser();
    const sessionData = await getParsedSessionCookie(ctx);

    if (!sessionData) {
      deleteAuthCookie(ctx, 'session');
      throw new AppError({ status: 401, type: 'unauthorized', severity: 'warn' });
    }

    await setUserSession(ctx, user, 'password', adminUser);

    logEvent({ msg: 'Started impersonation', meta: { admin: user.id, user: targetUserId } });

    return ctx.json(true, 200);
  })
  /*
   * Stop impersonation
   */
  .openapi(authRoutes.stopImpersonation, async (ctx) => {
    const sessionData = await getParsedSessionCookie(ctx, true);
    if (!sessionData) throw new AppError({ status: 401, type: 'unauthorized', severity: 'warn' });

    const { sessionToken, adminUserId } = sessionData;
    const { session } = await validateSession(sessionToken);
    if (!session) throw new AppError({ status: 401, type: 'unauthorized', severity: 'warn' });

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
        throw new AppError({ status: 401, type: 'unauthorized', severity: 'warn' });
      }

      const expireTimeSpan = new TimeSpan(adminsLastSession.expiresAt.getTime() - Date.now(), 'ms');
      const cookieContent = `${adminsLastSession.token}.${adminsLastSession.userId ?? ''}`;

      await setAuthCookie(ctx, 'session', cookieContent, expireTimeSpan);
    }

    logEvent({ msg: 'Stopped impersonation', meta: { admin: adminUserId || 'na', user: session.userId } });

    return ctx.json(true, 200);
  })
  /*
   * Sign out
   */
  .openapi(authRoutes.signOut, async (ctx) => {
    const sessionData = await getParsedSessionCookie(ctx);

    if (!sessionData) {
      deleteAuthCookie(ctx, 'session');
      throw new AppError({ status: 401, type: 'unauthorized', severity: 'warn' });
    }

    // Find session & invalidate
    const { session } = await validateSession(sessionData.sessionToken);
    if (session) await invalidateSessionById(session.id, session.userId);

    // Delete session cookie
    deleteAuthCookie(ctx, 'session');

    logEvent({ msg: 'User signed out', meta: { user: session?.userId || 'na' } });

    return ctx.json(true, 200);
  })
  /*
   * Initiates GitHub OAuth authentication flow
   */
  .openapi(authRoutes.githubSignIn, async (ctx) => {
    const { type, redirect } = ctx.req.valid('query');

    // Store OAuth context, to start OAuth flow in callback handler
    if (redirect) await setOAuthRedirect(ctx, redirect);
    if (type === 'invite') await handleOAuthInvitation(ctx);
    if (type === 'connect') await handleOAuthConnection(ctx);

    // Generate a `state` to prevent CSRF, and build URL with scope.
    const state = generateState();
    const url = githubAuth.createAuthorizationURL(state, githubScopes);

    // Start the OAuth session & flow (Persist `state`)
    return await createOAuthSession(ctx, 'github', url, state);
  })
  /*
   * Initiates Google OAuth authentication flow
   */
  .openapi(authRoutes.googleSignIn, async (ctx) => {
    const { type, redirect } = ctx.req.valid('query');

    // Store OAuth context, will resume in OAuth callback
    if (redirect) await setOAuthRedirect(ctx, redirect);
    if (type === 'invite') await handleOAuthInvitation(ctx);
    if (type === 'connect') await handleOAuthConnection(ctx);

    // Generate a `state`, PKCE, and scoped URL.
    const state = generateState();
    const codeVerifier = generateCodeVerifier();
    const url = googleAuth.createAuthorizationURL(state, codeVerifier, googleScopes);

    // Start the OAuth session & flow (Persist `state` and `codeVerifier`)
    return await createOAuthSession(ctx, 'google', url, state, codeVerifier);
  })
  /*
   * Initiates Microsoft OAuth authentication flow
   */
  .openapi(authRoutes.microsoftSignIn, async (ctx) => {
    const { type, redirect } = ctx.req.valid('query');

    // Store OAuth context, will resume in OAuth callback
    if (redirect) await setOAuthRedirect(ctx, redirect);
    if (type === 'invite') await handleOAuthInvitation(ctx);
    if (type === 'connect') await handleOAuthConnection(ctx);

    // Generate a `state`, PKCE, and scoped URL.
    const state = generateState();
    const codeVerifier = generateCodeVerifier();
    const url = microsoftAuth.createAuthorizationURL(state, codeVerifier, microsoftScopes);

    // Start the OAuth session & flow (Persist `state` and `codeVerifier`)
    return await createOAuthSession(ctx, 'microsoft', url, state, codeVerifier);
  })

  /*
   * GitHub authentication callback handler
   */
  .openapi(authRoutes.githubSignInCallback, async (ctx) => {
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

    // Verify `state` (CSRF protection)
    const stateCookie = await getAuthCookie(ctx, 'oauth-state');
    if (!state || !stateCookie || stateCookie !== state) {
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

      // Restore Context: linked oauthAccount, invitation or account linking
      const oauthAccount = await getOAuthAccount(providerUser.id, strategy, providerUser.email);
      const { connectUserId, inviteToken } = await getOAuthCookies(ctx);

      // Handle different OAuth flows based on context
      if (connectUserId) return await connectFlow(ctx, providerUser, strategy, connectUserId, oauthAccount);

      if (inviteToken) return await inviteFlow(ctx, providerUser, strategy, inviteToken.id, oauthAccount);

      return await basicFlow(ctx, providerUser, strategy, oauthAccount);
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
    } finally {
      // Clean up OAuth state session regardless of outcome
      clearOAuthSession(ctx);
    }
  })

  /*
   * Google authentication callback handler
   */
  .openapi(authRoutes.googleSignInCallback, async (ctx) => {
    const { state, code } = ctx.req.valid('query');

    // Check if Google OAuth is enabled
    const strategy = 'google' as EnabledOAuthProvider;
    if (!isOAuthEnabled(strategy)) {
      throw new AppError({ status: 400, type: 'unsupported_oauth', severity: 'error', meta: { strategy }, isRedirect: true });
    }

    // Verify `state` (CSRF protection) & PKCE validation
    const storedState = await getAuthCookie(ctx, 'oauth-state');
    const storedCodeVerifier = await getAuthCookie(ctx, 'oauth-code-verifier');
    if (!code || !storedState || !storedCodeVerifier || state !== storedState) {
      throw new AppError({ status: 401, type: 'invalid_state', severity: 'warn', meta: { strategy }, isRedirect: true });
    }

    try {
      // Exchange authorization code for access token and fetch Google user info
      const googleValidation = await googleAuth.validateAuthorizationCode(code, storedCodeVerifier);
      const accessToken = googleValidation.accessToken();

      const headers = { Authorization: `Bearer ${accessToken}` };
      const response = await fetch('https://openidconnect.googleapis.com/v1/userinfo', { headers });
      const googleUser = (await response.json()) as GoogleUserProps;
      const providerUser = transformSocialUserData(googleUser);

      // Restore Context: linked oauthAccount, invitation or account linking
      const oauthAccount = await getOAuthAccount(providerUser.id, strategy, providerUser.email);
      const { connectUserId, inviteToken } = await getOAuthCookies(ctx);

      // Handle different OAuth flows based on context
      if (connectUserId) return await connectFlow(ctx, providerUser, strategy, connectUserId, oauthAccount);

      if (inviteToken) return await inviteFlow(ctx, providerUser, strategy, inviteToken.id, oauthAccount);

      return await basicFlow(ctx, providerUser, strategy, oauthAccount);
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
    } finally {
      // Clean up OAuth state session regardless of outcome
      clearOAuthSession(ctx);
    }
  })

  /*
   * Microsoft authentication callback handler
   */
  .openapi(authRoutes.microsoftSignInCallback, async (ctx) => {
    const { state, code } = ctx.req.valid('query');

    // Check if Microsoft OAuth is enabled
    const strategy = 'microsoft' as EnabledOAuthProvider;
    if (!isOAuthEnabled(strategy)) {
      throw new AppError({ status: 400, type: 'unsupported_oauth', severity: 'error', meta: { strategy }, isRedirect: true });
    }

    // Verify `state` (CSRF protection) & PKCE validation
    const storedState = await getAuthCookie(ctx, 'oauth-state');
    const storedCodeVerifier = await getAuthCookie(ctx, 'oauth-code-verifier');
    if (!code || !storedState || !storedCodeVerifier || state !== storedState) {
      throw new AppError({ status: 401, type: 'invalid_state', severity: 'warn', meta: { strategy }, isRedirect: true });
    }

    try {
      // Exchange authorization code for access token and fetch Microsoft user info
      const microsoftValidation = await microsoftAuth.validateAuthorizationCode(code, storedCodeVerifier);
      const accessToken = microsoftValidation.accessToken();

      const headers = { Authorization: `Bearer ${accessToken}` };
      const response = await fetch('https://graph.microsoft.com/oidc/userinfo', { headers });
      const microsoftUser = (await response.json()) as MicrosoftUserProps;
      const providerUser = transformSocialUserData(microsoftUser);

      // Restore Context: linked oauthAccount, invitation or account linking
      const oauthAccount = await getOAuthAccount(providerUser.id, strategy, providerUser.email);
      const { connectUserId, inviteToken } = await getOAuthCookies(ctx);

      // Handle different OAuth flows based on context
      if (connectUserId) return await connectFlow(ctx, providerUser, strategy, connectUserId, oauthAccount);

      if (inviteToken) return await inviteFlow(ctx, providerUser, strategy, inviteToken.id, oauthAccount);

      return await basicFlow(ctx, providerUser, strategy, oauthAccount);
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
    } finally {
      // Clean up OAuth state session regardless of outcome
      clearOAuthSession(ctx);
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
    await setAuthCookie(ctx, 'passkey-challenge', challengeBase64, new TimeSpan(5, 'm'));
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
    if (!user) throw new AppError({ status: 404, type: 'not_found', severity: 'warn', entityType: 'user', meta: { strategy } });

    // Check if passkey challenge exists
    const challengeFromCookie = await getAuthCookie(ctx, 'passkey-challenge');
    if (!challengeFromCookie) throw new AppError({ status: 401, type: 'invalid_credentials', severity: 'warn', meta: { strategy } });

    // Get passkey credentials
    const [credentials] = await db.select().from(passkeysTable).where(eq(passkeysTable.userEmail, userEmail));
    if (!credentials) throw new AppError({ status: 404, type: 'not_found', severity: 'warn', meta: { strategy } });

    try {
      const isValid = await verifyPassKeyPublic(signature, authenticatorData, clientDataJSON, credentials.publicKey, challengeFromCookie);
      if (!isValid) throw new AppError({ status: 401, type: 'invalid_token', severity: 'warn', meta: { strategy } });
    } catch (error) {
      if (error instanceof Error) {
        throw new AppError({ status: 500, type: 'passkey_failed', severity: 'error', meta: { strategy }, originalError: error });
      }
    }

    await setUserSession(ctx, user, 'passkey');
    return ctx.json(true, 200);
  });

export default authRouteHandlers;
