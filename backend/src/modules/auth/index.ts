import { getRandomValues } from 'node:crypto';
import { encodeBase64 } from '@oslojs/encoding';
import { OAuth2RequestError, generateCodeVerifier, generateState } from 'arctic';
import { config } from 'config';
import { and, eq, or } from 'drizzle-orm';
import { render } from 'jsx-email';
import slugify from 'slugify';
import { db } from '#/db/db';
import { type OrganizationModel, organizationsTable } from '#/db/schema/organizations';
import { passkeysTable } from '#/db/schema/passkeys';
import { sessionsTable } from '#/db/schema/sessions';
import { tokensTable } from '#/db/schema/tokens';
import { type UserModel, usersTable } from '#/db/schema/users';
import { getUserBy, getUsersByConditions } from '#/db/util';
import { getContextToken, getContextUser } from '#/lib/context';
import { errorRedirect, errorResponse } from '#/lib/errors';
import { i18n } from '#/lib/i18n';
import { emailSender } from '#/lib/mailer';
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
import { CustomHono, type EnabledOauthProvider } from '#/types/common';
import { nanoid } from '#/utils/nanoid';
import { TimeSpan, createDate, isExpiredDate } from '#/utils/time-span';
// TODO shorten this import
import { CreatePasswordEmail } from '../../../emails/create-password';
import { EmailVerificationEmail } from '../../../emails/email-verification';
import { insertMembership } from '../memberships/helpers/insert-membership';
import { deleteAuthCookie, getAuthCookie, setAuthCookie } from './helpers/cookie';
import {
  clearOauthSession,
  createOauthSession,
  findOauthAccount,
  getOauthRedirectUrl,
  slugFromEmail,
  splitFullName,
  updateExistingUser,
} from './helpers/oauth';
import { parseAndValidatePasskeyAttestation, verifyPassKeyPublic } from './helpers/passkey';
import { invalidateSession, invalidateUserSessions, setUserSession, validateSession } from './helpers/session';
import { handleCreateUser } from './helpers/user';
import { sendVerificationEmail } from './helpers/verify-email';
import authRoutesConfig from './routes';

const enabledStrategies: readonly string[] = config.enabledAuthenticationStrategies;
const enabledOauthProviders: readonly string[] = config.enabledOauthProviders;

export const supportedOauthProviders = ['github', 'google', 'microsoft'] as const;

// Scopes for OAuth providers
const githubScopes = ['user:email'];
const googleScopes = ['profile', 'email'];
const microsoftScopes = ['profile', 'email'];

// Check if oauth provider is enabled by config
function isOAuthEnabled(provider: EnabledOauthProvider): boolean {
  if (!enabledStrategies.includes('oauth')) return false;
  return enabledOauthProviders.includes(provider);
}

const app = new CustomHono();

// Authentication endpoints
const authRoutes = app
  /*
   * Check if email exists
   */
  .openapi(authRoutesConfig.checkEmail, async (ctx) => {
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
  .openapi(authRoutesConfig.signUp, async (ctx) => {
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
  .openapi(authRoutesConfig.signUpWithToken, async (ctx) => {
    const { password } = ctx.req.valid('json');

    const validToken = getContextToken();
    if (!validToken) return errorResponse(ctx, 400, 'invalid_request', 'warn');

    // Verify if strategy allowed
    const strategy = 'password';
    if (!enabledStrategies.includes(strategy)) {
      return errorResponse(ctx, 400, 'forbidden_strategy', 'warn', undefined, { strategy });
    }

    // Delete token to prevent reuse
    await db.delete(tokensTable).where(eq(tokensTable.id, validToken.id));

    const hashedPassword = await hashPassword(password);
    const slug = slugFromEmail(validToken.email);

    // Create user & send verification email
    const newUser = {
      slug,
      name: slug,
      email: validToken.email,
      emailVerified: true,
      hashedPassword,
    };

    return await handleCreateUser({ ctx, newUser });
  })
  /*
   * Send verification email, also used to resend verification email.
   */
  .openapi(authRoutesConfig.sendVerificationEmail, async (ctx) => {
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

    // TODO store hashed token
    const token = nanoid(40);

    const [tokenRecord] = await db
      .insert(tokensTable)
      .values({
        token: token,
        type: 'email_verification',
        userId: user.id,
        email: user.email,
        createdBy: user.id,
        expiresAt: createDate(new TimeSpan(2, 'h')),
      })
      .returning();

    // Generate & send email
    const lng = user.language;
    const emailHtml = await render(
      EmailVerificationEmail({
        userLanguage: lng,
        verificationLink: `${config.frontendUrl}/auth/verify-email/${token}?tokenId=${tokenRecord.id}`,
      }),
    );

    const emailSubject = i18n.t('backend:email.email_verification.subject', { lng, appName: config.name });
    emailSender.send(user.email, emailSubject, emailHtml);

    logEvent('Verification email sent', { user: user.id });

    return ctx.json({ success: true }, 200);
  })
  /*
   * Verify email
   */
  .openapi(authRoutesConfig.verifyEmail, async (ctx) => {
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
  .openapi(authRoutesConfig.requestPassword, async (ctx) => {
    const { email } = ctx.req.valid('json');

    const user = await getUserBy('email', email.toLowerCase());
    if (!user) return errorResponse(ctx, 401, 'invalid_email', 'warn');

    // Delete old token that if exists
    await db.delete(tokensTable).where(and(eq(tokensTable.userId, user.id), eq(tokensTable.type, 'password_reset')));

    // TODO store hashed token
    const token = nanoid(40);

    const [tokenRecord] = await db
      .insert(tokensTable)
      .values({
        token: token,
        type: 'password_reset',
        userId: user.id,
        email,
        createdBy: user.id,
        expiresAt: createDate(new TimeSpan(2, 'h')),
      })
      .returning();

    // Generate & send email
    const lng = user.language;
    const emailHtml = await render(
      CreatePasswordEmail({
        userName: user.name,
        userLanguage: lng,
        createPasswordLink: `${config.frontendUrl}/auth/create-password/${token}?tokenId=${tokenRecord.id}`,
      }),
    );

    const emailSubject = i18n.t('backend:email.create_password.subject', { lng, appName: config.name });
    emailSender.send(email, emailSubject, emailHtml);

    logEvent('Create password link sent', { user: user.id });

    return ctx.json({ success: true }, 200);
  })
  /*
   * Create password with token
   */
  .openapi(authRoutesConfig.createPasswordCallback, async (ctx) => {
    const { password } = ctx.req.valid('json');
    const passwordToken = ctx.req.valid('param').token;

    // Verify if strategy allowed
    const strategy = 'password';
    if (!enabledStrategies.includes(strategy)) {
      return errorResponse(ctx, 400, 'forbidden_strategy', 'warn', undefined, { strategy });
    }

    // Get password token
    const [token] = await db
      .select()
      .from(tokensTable)
      .where(and(eq(tokensTable.token, passwordToken), eq(tokensTable.type, 'password_reset')));
    await db.delete(tokensTable).where(eq(tokensTable.token, passwordToken));

    // If the token is not found or expired
    if (!token || !token.userId || isExpiredDate(token.expiresAt)) {
      return errorResponse(ctx, 401, 'invalid_token', 'warn');
    }
    const user = await getUserBy('id', token.userId);
    // If the user is not found or the email is different from the token email
    if (!user || user.email !== token.email) return errorResponse(ctx, 404, 'not_found', 'warn', 'user', { userId: token.userId });

    await invalidateUserSessions(user.id);

    // hash password
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
  .openapi(authRoutesConfig.signIn, async (ctx) => {
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
  .openapi(authRoutesConfig.checkToken, async (ctx) => {
    // Find token in request
    const { id } = ctx.req.valid('param');
    if (!id) return errorResponse(ctx, 400, 'invalid_request', 'warn');

    // Check if token exists
    const [tokenRecord] = await db.select().from(tokensTable).where(eq(tokensTable.id, id));
    if (!tokenRecord) return errorResponse(ctx, 404, 'not_found', 'warn');

    // If token is expired, return an error
    if (isExpiredDate(tokenRecord.expiresAt)) return errorResponse(ctx, 401, 'expired_token', 'warn', undefined);

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
  .openapi(authRoutesConfig.acceptOrgInvite, async (ctx) => {
    const token = getContextToken();
    const user = getContextUser();

    // Make sure its an organization invitation
    if (!token.organizationId || !token.role) return errorResponse(ctx, 401, 'invalid_token', 'warn');

    // Make sure correct user accepts invitation
    if (user.id !== token.userId) return errorResponse(ctx, 401, 'user_mismatch', 'warn');

    // Delete token
    await db.delete(tokensTable).where(eq(tokensTable.id, token.id));

    // // Extract role and membershipInfo from token, ensuring proper types
    // // TODO can this endpoint be simplified?
    // const { role, membershipInfo } = token as {
    //   role: MembershipModel['role'];
    //   membershipInfo?: typeof token.membershipInfo;
    // };

    const [organization]: (OrganizationModel | undefined)[] = await db
      .select()
      .from(organizationsTable)
      .where(and(eq(organizationsTable.id, token.organizationId)))
      .limit(1);

    // if (!organization) return errorResponse(ctx, 404, 'not_found', 'warn', 'organization', { organization: token.organizationId });

    // const memberships = await db
    //   .select()
    //   .from(membershipsTable)
    //   .where(and(eq(membershipsTable.organizationId, organization.id), eq(membershipsTable.type, 'organization')));

    // const existingMembership = memberships.find(({ userId }) => userId === user.id);

    // if (existingMembership && existingMembership.role !== role && !membershipInfo) {
    //   await db
    //     .update(membershipsTable)
    //     .set({ role })
    //     .where(and(eq(membershipsTable.organizationId, organization.id), eq(membershipsTable.userId, user.id)));

    //   return ctx.json({ success: true }, 200);
    // }

    // Insert organization membership
    await insertMembership({ user, role: token.role, entity: organization });

    // const newMenuItem = {
    //   newItem: { ...organization, membership: orgMembership },
    //   sectionName: menuSections.find((el) => el.entityType === orgMembership.type)?.name,
    // };

    // // SSE with organization data, to update user's menu
    // sendSSEToUsers([user.id], 'add_entity', newMenuItem);

    // // SSE to to update members queries
    // sendSSEToUsers(
    //   memberships.map(({ userId }) => userId).filter((id) => id !== user.id),
    //   'member_accept_invite',
    //   { id: organization.id, slug: organization.slug },
    // );

    // if (membershipInfo) {
    //   const { parentEntity: parentInfo, targetEntity: targetInfo } = membershipInfo;
    //   const { entity: targetEntityType, idOrSlug: targetIdOrSlug } = targetInfo;

    //   const targetEntity = await resolveEntity(targetEntityType, targetIdOrSlug);
    //   // Resolve parentEntity if provided
    //   const parentEntity = parentInfo ? await resolveEntity(parentInfo.entity, parentInfo.idOrSlug) : null;

    //   if (!targetEntity) return errorResponse(ctx, 404, 'not_found', 'warn', targetEntityType, { [targetEntityType]: targetIdOrSlug });

    //   const [createdParentMembership, createdMembership] = await Promise.all([
    //     parentEntity ? insertMembership({ user, role, entity: parentEntity }) : Promise.resolve(null),
    //     insertMembership({ user, role, entity: targetEntity, parentEntity }),
    //   ]);

    //   if (createdParentMembership && parentEntity) {
    //     // SSE with parentEntity data, to update user's menu
    //     sendSSEToUsers([user.id], 'add_entity', {
    //       newItem: { ...parentEntity, membership: createdParentMembership },
    //       sectionName: menuSections.find((el) => el.entityType === parentEntity.entity)?.name,
    //     });
    //   }

    //   // SSE with entity data, to update user's menu
    //   sendSSEToUsers([user.id], 'add_entity', {
    //     newItem: { ...targetEntity, membership: createdMembership },
    //     sectionName: menuSections.find((el) => el.entityType === targetEntity.entity)?.name,
    //     ...(parentEntity && { parentSlug: parentEntity.slug }),
    //   });
    // }

    return ctx.json({ success: true }, 200);
  })
  /*
   * TODO simplify: Start impersonation
   */
  .openapi(authRoutesConfig.startImpersonation, async (ctx) => {
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
   * TODO simplify: Stop impersonation
   */
  .openapi(authRoutesConfig.stopImpersonation, async (ctx) => {
    const sessionToken = await getAuthCookie(ctx, 'session');

    if (!sessionToken) {
      deleteAuthCookie(ctx, 'session');
      return errorResponse(ctx, 401, 'unauthorized', 'warn');
    }

    const { session } = await validateSession(sessionToken);

    if (session) {
      await invalidateSession(session.id);
      if (session.adminUserId) {
        const sessions = await db.select().from(sessionsTable).where(eq(sessionsTable.userId, session.adminUserId));
        const [lastSession] = sessions.sort((a, b) => b.expiresAt.getTime() - a.expiresAt.getTime());

        const adminsLastSession = await validateSession(lastSession.id);

        if (!adminsLastSession.session) {
          deleteAuthCookie(ctx, 'session');
          return errorResponse(ctx, 401, 'unauthorized', 'warn');
        }
      }
    } else deleteAuthCookie(ctx, 'session');
    logEvent('Admin user signed out from impersonate to his own account', { user: session?.adminUserId || 'na' });

    return ctx.json({ success: true }, 200);
  })
  /*
   * Sign out
   */
  .openapi(authRoutesConfig.signOut, async (ctx) => {
    const sessionToken = await getAuthCookie(ctx, 'session');

    if (!sessionToken) {
      deleteAuthCookie(ctx, 'session');
      return errorResponse(ctx, 401, 'unauthorized', 'warn');
    }

    // Find session & invalidate
    const { session } = await validateSession(sessionToken);
    if (session) await invalidateSession(session.id);

    // Delete session cookie
    deleteAuthCookie(ctx, 'session');

    logEvent('User signed out', { user: session?.userId || 'na' });

    return ctx.json({ success: true }, 200);
  })
  /*
   * Github authentication
   */
  .openapi(authRoutesConfig.githubSignIn, async (ctx) => {
    const { redirect, connect, token } = ctx.req.valid('query');

    const state = generateState();
    const url = githubAuth.createAuthorizationURL(state, githubScopes);

    return await createOauthSession(ctx, 'github', url, state, '', redirect, connect, token);
  })
  /*
   * Google authentication
   */
  .openapi(authRoutesConfig.googleSignIn, async (ctx) => {
    const { redirect, connect, token } = ctx.req.valid('query');

    const state = generateState();
    const codeVerifier = generateCodeVerifier();
    const url = googleAuth.createAuthorizationURL(state, codeVerifier, googleScopes);

    return await createOauthSession(ctx, 'google', url, state, codeVerifier, redirect, connect, token);
  })
  /*
   * Microsoft authentication
   */
  .openapi(authRoutesConfig.microsoftSignIn, async (ctx) => {
    const { redirect, connect, token } = ctx.req.valid('query');

    const state = generateState();
    const codeVerifier = generateCodeVerifier();
    const url = microsoftAuth.createAuthorizationURL(state, codeVerifier, microsoftScopes);

    return await createOauthSession(ctx, 'microsoft', url, state, codeVerifier, redirect, connect, token);
  })
  /*
   * Github authentication callback
   */
  .openapi(authRoutesConfig.githubSignInCallback, async (ctx) => {
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
      const [existingOauthAccount] = await findOauthAccount(strategy, String(githubUser.id));
      if (existingOauthAccount) {
        // Redirect if already assigned to another user
        if (userId && existingOauthAccount.userId !== userId) return errorRedirect(ctx, 'oauth_mismatch', 'warn');
        await setUserSession(ctx, existingOauthAccount.userId, strategy);
        return ctx.redirect(redirectExistingUserUrl, 302);
      }

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
        // t('error:invalid_credentials.text')
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
  .openapi(authRoutesConfig.googleSignInCallback, async (ctx) => {
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
      const [existingOauthAccount] = await findOauthAccount(strategy, user.sub);
      if (existingOauthAccount) {
        // Redirect if already assigned to another user
        if (userId && existingOauthAccount.userId !== userId) return errorRedirect(ctx, 'oauth_mismatch', 'warn');
        await setUserSession(ctx, existingOauthAccount.userId, strategy);
        return ctx.redirect(redirectExistingUserUrl, 302);
      }

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
  .openapi(authRoutesConfig.microsoftSignInCallback, async (ctx) => {
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
      const [existingOauthAccount] = await findOauthAccount(strategy, user.sub);
      if (existingOauthAccount) {
        // Redirect if already assigned to another user
        if (userId && existingOauthAccount.userId !== userId) return errorRedirect(ctx, 'oauth_mismatch', 'warn');
        await setUserSession(ctx, existingOauthAccount.userId, strategy);
        return ctx.redirect(redirectExistingUserUrl, 302);
      }

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
  .openapi(authRoutesConfig.getPasskeyChallenge, async (ctx) => {
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
  .openapi(authRoutesConfig.registerPasskey, async (ctx) => {
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
  .openapi(authRoutesConfig.verifyPasskey, async (ctx) => {
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
