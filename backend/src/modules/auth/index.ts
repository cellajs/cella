import { eq } from 'drizzle-orm';
import { render } from 'jsx-email';
import { generateId } from 'lucia';
import { TimeSpan, createDate, isWithinExpirationDate } from 'oslo';
import { VerificationEmail } from '../../../emails/email-verification';
import { ResetPasswordEmail } from '../../../emails/reset-password';

import { auth } from '#/db/lucia';

import { OAuth2RequestError, generateCodeVerifier, generateState } from 'arctic';
import { deleteCookie, getCookie } from 'hono/cookie';

import { encodeBase64 } from '@oslojs/encoding';
import slugify from 'slugify';
import { githubAuth, googleAuth, microsoftAuth } from '#/db/lucia';

import { createSession, findOauthAccount, getRedirectUrl, handleExistingUser, slugFromEmail, splitFullName } from './helpers/oauth';

import { getRandomValues } from 'node:crypto';
import { config } from 'config';
import type { z } from 'zod';
import { db } from '#/db/db';
import { passkeysTable } from '#/db/schema/passkeys';
import { tokensTable } from '#/db/schema/tokens';
import { usersTable } from '#/db/schema/users';
import { getUserBy } from '#/db/util';
import { getContextUser } from '#/lib/context';
import { errorResponse } from '#/lib/errors';
import { i18n } from '#/lib/i18n';
import { emailSender } from '#/lib/mailer';
import { logEvent } from '#/middlewares/logger/log-event';
import { hashPasswordWithArgon, verifyPasswordWithArgon } from '#/modules/auth/helpers/argon2id';
import { CustomHono, type EnabledOauthProviderOptions } from '#/types/common';
import { nanoid } from '#/utils/nanoid';
import generalRouteConfig from '../general/routes';
import { removeSessionCookie, setCookie, setImpersonationSessionCookie, setSessionCookie } from './helpers/cookies';
import { parseAndValidatePasskeyAttestation, verifyPassKeyPublic } from './helpers/passkey';
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
function isOAuthEnabled(provider: EnabledOauthProviderOptions): boolean {
  if (!enabledStrategies.includes('oauth')) return false;
  return enabledOauthProviders.includes(provider);
}

const app = new CustomHono();

type CheckTokenResponse = z.infer<(typeof generalRouteConfig.checkToken.responses)['200']['content']['application/json']['schema']> | undefined;
type TokenData = Extract<CheckTokenResponse, { data: unknown }>['data'];

// Authentication endpoints
const authRoutes = app
  /*
   * Check if email exists
   */
  .openapi(authRoutesConfig.checkEmail, async (ctx) => {
    const { email } = ctx.req.valid('json');

    const user = await getUserBy('email', email.toLowerCase());

    if (!user) return errorResponse(ctx, 404, 'not_found', 'warn', 'user');

    // Check if user has a passkey
    const passkey = await db.select().from(passkeysTable).where(eq(passkeysTable.userEmail, user.email));
    const hasPasskey = !!passkey.length;

    return ctx.json({ success: true, data: { hasPasskey } }, 200);
  })
  /*
   * Sign up with email & password
   */
  .openapi(authRoutesConfig.signUp, async (ctx) => {
    const { email, password, token } = ctx.req.valid('json');

    // Verify if strategy allowed
    const strategy = 'password';
    if (!enabledStrategies.includes(strategy)) {
      return errorResponse(ctx, 400, 'Forbidden authentication strategy', 'warn', undefined, { strategy });
    }

    // In invitation mode this form is used to complete registration.
    let tokenData: TokenData | undefined;

    if (token) {
      const response = await fetch(`${config.backendUrl + generalRouteConfig.checkToken.path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ token }),
      });

      const data: CheckTokenResponse = await response.json();
      tokenData = data?.data;
    }

    const hashedPassword = await hashPasswordWithArgon(password);
    const userId = nanoid();

    const slug = slugFromEmail(email);

    const isEmailVerified = tokenData?.email === email;

    // Create user & send verification email
    const newUser = {
      id: userId,
      slug,
      name: slug,
      email: email,
      emailVerified: isEmailVerified,
      language: config.defaultLanguage,
      hashedPassword,
    };

    return await handleCreateUser(ctx, newUser, { isInvite: !!tokenData });
  })
  /*
   * Send verification email
   */
  .openapi(authRoutesConfig.sendVerificationEmail, async (ctx) => {
    const { email } = ctx.req.valid('json');

    // Check if user exists
    const user = await getUserBy('email', email.toLowerCase());
    if (!user) return errorResponse(ctx, 404, 'not_found', 'warn', 'user');

    // Creating email verification token
    await db.delete(tokensTable).where(eq(tokensTable.userId, user.id));
    const token = generateId(40);
    await db.insert(tokensTable).values({
      id: token,
      type: 'email_verification',
      userId: user.id,
      email,
      expiresAt: createDate(new TimeSpan(2, 'h')),
    });

    // Generating email html
    const emailHtml = await render(
      VerificationEmail({
        userLanguage: user?.language || config.defaultLanguage,
        verificationLink: `${config.frontendUrl}/auth/verify-email/${token}`,
      }),
    );

    emailSender.send(
      email,
      i18n.t('backend:email.subject.verify_email', {
        lng: config.defaultLanguage,
        appName: config.name,
      }),
      emailHtml,
    );

    logEvent('Verification email sent', { user: user.id });

    return ctx.json({ success: true }, 200);
  })
  /*
   * Verify email
   */
  .openapi(authRoutesConfig.verifyEmail, async (ctx) => {
    const { resend } = ctx.req.valid('query');
    const { token: verificationToken } = ctx.req.valid('json');

    const [token] = await db.select().from(tokensTable).where(eq(tokensTable.id, verificationToken));

    // If the token is not found or expired
    if (!token || !token.userId || !isWithinExpirationDate(token.expiresAt)) {
      // If 'resend' is true and the token has an email we will resend the email
      if (resend === 'true' && token && token.email) {
        sendVerificationEmail(token.email);

        await db.delete(tokensTable).where(eq(tokensTable.id, verificationToken));

        return ctx.json({ success: true }, 200);
      }

      // t('common:error.invalid_token')
      return errorResponse(ctx, 400, 'invalid_token', 'warn', undefined, {
        user: token?.userId || 'na',
        type: 'verification',
      });
    }

    const user = await getUserBy('id', token.userId);

    // If user not found or email different from token email
    if (!user || user.email !== token.email) {
      // If 'resend' true and token has an email, we will send again
      if (resend === 'true' && token && token.email) {
        sendVerificationEmail(token.email);

        await db.delete(tokensTable).where(eq(tokensTable.id, verificationToken));

        return ctx.json({ success: true }, 200);
      }

      return errorResponse(ctx, 400, 'invalid_token', 'warn');
    }

    await db.update(usersTable).set({ emailVerified: true }).where(eq(usersTable.id, user.id));

    // Sign in user
    await setSessionCookie(ctx, user.id, 'email_verification');

    return ctx.json({ success: true }, 200);
  })
  /*
   * Request reset password email
   */
  .openapi(authRoutesConfig.resetPassword, async (ctx) => {
    const { email } = ctx.req.valid('json');

    const user = await getUserBy('email', email.toLowerCase());
    if (!user) return errorResponse(ctx, 400, 'invalid_email', 'warn');

    // creating password reset token
    await db.delete(tokensTable).where(eq(tokensTable.userId, user.id));
    const token = generateId(40);
    await db.insert(tokensTable).values({
      id: token,
      type: 'password_reset',
      userId: user.id,
      email,
      expiresAt: createDate(new TimeSpan(2, 'h')),
    });

    // generating email html
    const emailHtml = await render(
      ResetPasswordEmail({
        userName: user.name,
        userLanguage: user?.language || config.defaultLanguage,
        resetPasswordLink: `${config.frontendUrl}/auth/reset-password/${token}`,
      }),
    );

    emailSender.send(
      email,
      i18n.t('backend:email.subject.reset_password', {
        lng: config.defaultLanguage,
        appName: config.name,
      }),
      emailHtml,
    );

    logEvent('Reset password link sent', { user: user.id });

    return ctx.json({ success: true }, 200);
  })
  /*
   * Reset password with token
   */
  .openapi(authRoutesConfig.resetPasswordCallback, async (ctx) => {
    const { password } = ctx.req.valid('json');
    const verificationToken = ctx.req.valid('param').token;

    // Verify if strategy allowed
    const strategy = 'password';
    if (!enabledStrategies.includes(strategy)) {
      return errorResponse(ctx, 400, 'Forbidden authentication strategy', 'warn', undefined, { strategy });
    }

    const [token] = await db.select().from(tokensTable).where(eq(tokensTable.id, verificationToken));
    await db.delete(tokensTable).where(eq(tokensTable.id, verificationToken));

    // If the token is not found or expired
    if (!token || !token.userId || !isWithinExpirationDate(token.expiresAt)) {
      return errorResponse(ctx, 400, 'invalid_token', 'warn');
    }
    const user = await getUserBy('id', token.userId);
    // If the user is not found or the email is different from the token email
    if (!user || user.email !== token.email) return errorResponse(ctx, 404, 'not_found', 'warn', 'user', { userId: token.userId });

    await auth.invalidateUserSessions(user.id);

    // hash password
    const hashedPassword = await hashPasswordWithArgon(password);

    // update user password and set email verified
    await db.update(usersTable).set({ hashedPassword, emailVerified: true }).where(eq(usersTable.id, user.id));

    // Sign in user
    await setSessionCookie(ctx, user.id, 'password_reset');

    return ctx.json({ success: true }, 200);
  })
  /*
   * Sign in with email and password
   */
  .openapi(authRoutesConfig.signIn, async (ctx) => {
    const { email, password, token } = ctx.req.valid('json');

    // Verify if strategy allowed
    const strategy = 'password';
    if (!enabledStrategies.includes(strategy)) {
      return errorResponse(ctx, 400, 'Forbidden authentication strategy', 'warn', undefined, { strategy });
    }

    let tokenData: TokenData | undefined;
    if (token) {
      const response = await fetch(`${config.backendUrl + generalRouteConfig.checkToken.path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ token }),
      });

      const data: CheckTokenResponse = await response.json();
      tokenData = data?.data;
    }

    const user = await getUserBy('email', email.toLowerCase(), 'unsafe');

    // If the user is not found or signed up with oauth
    if (!user) return errorResponse(ctx, 404, 'not_found', 'warn', 'user');
    if (!user.hashedPassword) return errorResponse(ctx, 404, 'no_password_found', 'warn');

    const validPassword = await verifyPasswordWithArgon(user.hashedPassword, password);

    if (!validPassword) return errorResponse(ctx, 400, 'invalid_password', 'warn');

    const isEmailVerified = user.emailVerified || tokenData?.email === user.email;

    // Send verify email if email not verified
    if (!isEmailVerified) {
      sendVerificationEmail(email);

      // TODO return ctx.redirect(`${config.frontendUrl}/auth/verify-email`);
      // return ctx.json({}, 302, {
      //   Location: `${config.frontendUrl}/auth/verify-email`,
      // });
    } else {
      await setSessionCookie(ctx, user.id, 'password');
    }
    return ctx.json({ success: true }, 200);
  })
  /*
   * Impersonate sign in
   */
  .openapi(authRoutesConfig.impersonationSignIn, async (ctx) => {
    const user = getContextUser();
    const cookieHeader = ctx.req.raw.headers.get('Cookie');
    const sessionId = auth.readSessionCookie(cookieHeader ?? '');
    if (!sessionId) {
      removeSessionCookie(ctx);
      return errorResponse(ctx, 401, 'unauthorized', 'warn');
    }
    const { targetUserId } = ctx.req.valid('query');
    await setImpersonationSessionCookie(ctx, targetUserId, user.id);

    return ctx.json({ success: true }, 200);
  })
  /*
   * Impersonate sign out
   */
  .openapi(authRoutesConfig.impersonationSignOut, async (ctx) => {
    const cookieHeader = ctx.req.raw.headers.get('Cookie');
    const sessionId = auth.readSessionCookie(cookieHeader ?? '');

    if (!sessionId) {
      removeSessionCookie(ctx);
      return errorResponse(ctx, 401, 'unauthorized', 'warn');
    }

    const { session } = await auth.validateSession(sessionId);

    if (session) {
      await auth.invalidateSession(session.id);
      if (session.adminUserId) {
        const sessions = await auth.getUserSessions(session.adminUserId);
        const [lastSession] = sessions.sort((a, b) => b.expiresAt.getTime() - a.expiresAt.getTime());
        const adminsLastSession = await auth.validateSession(lastSession.id);
        if (!adminsLastSession.session) {
          removeSessionCookie(ctx);
          return errorResponse(ctx, 401, 'unauthorized', 'warn');
        }
        const sessionCookie = auth.createSessionCookie(adminsLastSession.session.id);
        ctx.header('Set-Cookie', sessionCookie.serialize());
      }
    } else removeSessionCookie(ctx);
    logEvent('Admin user signed out from impersonate to his own account', { user: session?.adminUserId || 'na' });

    return ctx.json({ success: true }, 200);
  })
  /*
   * Sign out
   */
  .openapi(authRoutesConfig.signOut, async (ctx) => {
    const cookieHeader = ctx.req.raw.headers.get('Cookie');
    const sessionId = auth.readSessionCookie(cookieHeader ?? '');

    if (!sessionId) {
      removeSessionCookie(ctx);
      return errorResponse(ctx, 401, 'unauthorized', 'warn');
    }

    const { session } = await auth.validateSession(sessionId);

    if (session) await auth.invalidateSession(session.id);

    removeSessionCookie(ctx);
    logEvent('User signed out', { user: session?.userId || 'na' });

    return ctx.json({ success: true }, 200);
  })
  /*
   * Github authentication
   */
  .openapi(authRoutesConfig.githubSignIn, async (ctx) => {
    const { redirect } = ctx.req.valid('query');

    const state = generateState();
    const url = await githubAuth.createAuthorizationURL(state, githubScopes);

    createSession(ctx, 'github', state, '', redirect);
    return ctx.redirect(url.toString(), 302);
  })
  /*
   * Google authentication
   */
  .openapi(authRoutesConfig.googleSignIn, async (ctx) => {
    const { redirect } = ctx.req.valid('query');

    const state = generateState();
    const codeVerifier = generateCodeVerifier();
    const url = await googleAuth.createAuthorizationURL(state, codeVerifier, googleScopes);

    createSession(ctx, 'google', state, codeVerifier, redirect);

    return ctx.redirect(url.toString(), 302);
  })
  /*
   * Microsoft authentication
   */
  .openapi(authRoutesConfig.microsoftSignIn, async (ctx) => {
    const { redirect } = ctx.req.valid('query');

    const state = generateState();
    const codeVerifier = generateCodeVerifier();
    const url = await microsoftAuth.createAuthorizationURL(state, codeVerifier, microsoftScopes);

    createSession(ctx, 'microsoft', state, codeVerifier, redirect);

    return ctx.redirect(url.toString(), 302);
  })
  /*
   * Github authentication callback
   */
  .openapi(authRoutesConfig.githubSignInCallback, async (ctx) => {
    const { code, state } = ctx.req.valid('query');
    const strategy = 'github' as EnabledOauthProviderOptions;

    if (!isOAuthEnabled(strategy)) {
      return errorResponse(ctx, 400, 'Unsupported oauth', 'warn', undefined, { strategy });
    }

    const stateCookie = getCookie(ctx, 'oauth_state');

    // verify state
    if (!state || !stateCookie || !code || stateCookie !== state) {
      // t('common:error.invalid_state.text')
      return errorResponse(ctx, 400, 'invalid_state', 'warn', undefined, { strategy });
    }

    const redirectExistingUserUrl = getRedirectUrl(ctx);

    try {
      const githubValidation = await githubAuth.validateAuthorizationCode(code);
      const accessToken = githubValidation.accessToken();

      // Get user info from github
      const githubUserResponse = await fetch('https://api.github.com/user', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const githubUser: {
        avatar_url: string;
        bio: string | null;
        blog: string | null;
        company: string | null;
        created_at: string;
        email: string | null;
        events_url: string;
        followers: number;
        followers_url: string;
        following: number;
        following_url: string;
        gists_url: string;
        gravatar_id: string | null;
        hireable: boolean | null;
        html_url: string;
        id: number;
        location: string | null;
        login: string;
        name: string | null;
        node_id: string;
        organizations_url: string;
        public_gists: number;
        public_repos: number;
        received_events_url: string;
        repos_url: string;
        site_admin: boolean;
        starred_url: string;
        subscriptions_url: string;
        type: string;
        updated_at: string;
        url: string;
        twitter_username?: string | null;
      } = await githubUserResponse.json();

      // Check if oauth account already exists
      const [existingOauthAccount] = await findOauthAccount(strategy, String(githubUser.id));
      if (existingOauthAccount) {
        await setSessionCookie(ctx, existingOauthAccount.userId, strategy);
        return ctx.redirect(redirectExistingUserUrl, 302);
      }

      // Get user emails from github
      const githubUserEmailsResponse = await fetch('https://api.github.com/user/emails', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      const githubUserEmails: {
        email: string;
        primary: boolean;
        verified: boolean;
        visibility: string | null;
      }[] = await githubUserEmailsResponse.json();

      const primaryEmail = githubUserEmails.find((email) => email.primary);

      if (!primaryEmail) {
        // t('common:error.no_email_found.text')
        return errorResponse(ctx, 400, 'no_email_found', 'warn');
      }

      const slug = slugify(githubUser.login, { lower: true });
      const { firstName, lastName } = splitFullName(githubUser.name || slug);

      // Check if user has an invite token
      const inviteToken = getCookie(ctx, 'oauth_invite_token');

      deleteCookie(ctx, 'oauth_invite_token');

      const githubUserEmail = primaryEmail.email.toLowerCase();
      let userEmail = githubUserEmail;

      if (inviteToken) {
        const [token] = await db.select().from(tokensTable).where(eq(tokensTable.id, inviteToken));

        // If token is invalid or expired
        if (!token || !token.email || !isWithinExpirationDate(token.expiresAt)) {
          return errorResponse(ctx, 400, 'invalid_token', 'warn', undefined, {
            strategy,
            type: 'invitation',
          });
        }

        userEmail = token.email;
      }

      // Check if user already exists
      const existingUser = await getUserBy('email', userEmail);
      if (existingUser) {
        return await handleExistingUser(ctx, existingUser, strategy, {
          providerUser: {
            id: String(githubUser.id),
            email: githubUserEmail,
            bio: githubUser.bio,
            thumbnailUrl: githubUser.avatar_url,
            firstName,
            lastName,
          },
          redirectUrl: redirectExistingUserUrl,
          isEmailVerified: existingUser.emailVerified || !!inviteToken || primaryEmail.verified,
        });
      }

      const userId = nanoid();
      const redirectNewUserUrl = getRedirectUrl(ctx, true);
      // Create new user and oauth account
      return await handleCreateUser(
        ctx,
        {
          id: userId,
          slug: slugify(githubUser.login, { lower: true }),
          email: primaryEmail.email.toLowerCase(),
          name: githubUser.name || githubUser.login,
          thumbnailUrl: githubUser.avatar_url,
          bio: githubUser.bio,
          emailVerified: primaryEmail.verified,
          language: config.defaultLanguage,
          firstName,
          lastName,
        },
        {
          provider: {
            id: strategy,
            userId: String(githubUser.id),
          },
          isInvite: !!inviteToken,
          redirectUrl: redirectNewUserUrl,
        },
      );
    } catch (error) {
      // Handle invalid credentials
      if (error instanceof OAuth2RequestError) {
        // t('common:error.invalid_credentials.text')
        return errorResponse(ctx, 400, 'invalid_credentials', 'warn', undefined, { strategy });
      }

      if (error instanceof Error) {
        const errorMessage = error.message;
        logEvent('Error signing in with GitHub', { strategy, errorMessage }, 'error');
      }

      throw error;
    }
  })
  /*
   * Google authentication callback
   */
  .openapi(authRoutesConfig.googleSignInCallback, async (ctx) => {
    const { state, code } = ctx.req.valid('query');
    const strategy = 'google' as EnabledOauthProviderOptions;

    if (!isOAuthEnabled(strategy)) {
      return errorResponse(ctx, 400, 'Unsupported oauth', 'warn', undefined, { strategy });
    }

    const storedState = getCookie(ctx, 'oauth_state');
    const storedCodeVerifier = getCookie(ctx, 'oauth_code_verifier');

    // verify state
    if (!code || !storedState || !storedCodeVerifier || state !== storedState) {
      return errorResponse(ctx, 400, 'invalid_state', 'warn', undefined, { strategy });
    }

    const redirectExistingUserUrl = getRedirectUrl(ctx);

    try {
      const googleValidation = await googleAuth.validateAuthorizationCode(code, storedCodeVerifier);
      const accessToken = googleValidation.accessToken();

      // Get user info from google
      const response = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const user: {
        sub: string;
        name: string;
        given_name: string;
        family_name: string;
        picture: string;
        email: string;
        email_verified: boolean;
        locale: string;
      } = await response.json();

      // Check if oauth account already exists
      const [existingOauthAccount] = await findOauthAccount(strategy, user.sub);
      if (existingOauthAccount) {
        await setSessionCookie(ctx, existingOauthAccount.userId, strategy);

        return ctx.redirect(redirectExistingUserUrl, 302);
      }

      // Check if user already exists
      const existingUser = await getUserBy('email', user.email.toLowerCase());

      if (existingUser) {
        return await handleExistingUser(ctx, existingUser, strategy, {
          providerUser: {
            id: user.sub,
            email: user.email,
            thumbnailUrl: user.picture,
            firstName: user.given_name,
            lastName: user.family_name,
          },
          redirectUrl: redirectExistingUserUrl,
          // TODO: invite token
          isEmailVerified: existingUser.emailVerified || user.email_verified,
        });
      }

      const userId = nanoid();
      const redirectNewUserUrl = getRedirectUrl(ctx, true);
      // Create new user and oauth account
      return await handleCreateUser(
        ctx,
        {
          id: userId,
          slug: slugFromEmail(user.email),
          email: user.email.toLowerCase(),
          name: user.given_name,
          emailVerified: user.email_verified,
          language: config.defaultLanguage,
          thumbnailUrl: user.picture,
          firstName: user.given_name,
          lastName: user.family_name,
        },
        {
          provider: {
            id: strategy,
            userId: user.sub,
          },
          redirectUrl: redirectNewUserUrl,
        },
      );
    } catch (error) {
      // Handle invalid credentials
      if (error instanceof OAuth2RequestError) {
        return errorResponse(ctx, 400, 'invalid_credentials', 'warn', undefined, { strategy });
      }

      if (error instanceof Error) {
        const errorMessage = error.message;
        logEvent('Error signing in with Google', { strategy, errorMessage }, 'error');
      }

      throw error;
    }
  })
  /*
   * Microsoft authentication callback
   */
  .openapi(authRoutesConfig.microsoftSignInCallback, async (ctx) => {
    const { state, code } = ctx.req.valid('query');
    const strategy = 'microsoft' as EnabledOauthProviderOptions;

    if (!isOAuthEnabled(strategy)) {
      return errorResponse(ctx, 400, 'Unsupported oauth', 'warn', undefined, { strategy });
    }

    const storedState = getCookie(ctx, 'oauth_state');
    const storedCodeVerifier = getCookie(ctx, 'oauth_code_verifier');

    // verify state
    if (!code || !storedState || !storedCodeVerifier || state !== storedState) {
      return errorResponse(ctx, 400, 'invalid_state', 'warn', undefined, { strategy });
    }

    const redirectExistingUserUrl = getRedirectUrl(ctx);

    try {
      const microsoftValidation = await microsoftAuth.validateAuthorizationCode(code, storedCodeVerifier);
      const accessToken = microsoftValidation.accessToken();

      // Get user info from microsoft
      const response = await fetch('https://graph.microsoft.com/oidc/userinfo', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const user: {
        sub: string;
        name: string;
        given_name: string;
        family_name: string;
        picture: string;
        email: string | undefined;
      } = await response.json();

      // Check if oauth account already exists
      const [existingOauthAccount] = await findOauthAccount(strategy, user.sub);
      if (existingOauthAccount) {
        await setSessionCookie(ctx, existingOauthAccount.userId, strategy);

        return ctx.redirect(redirectExistingUserUrl, 302);
      }

      if (!user.email) {
        return errorResponse(ctx, 400, 'no_email_found', 'warn', undefined);
      }

      // Check if user already exists
      const existingUser = await getUserBy('email', user.email.toLowerCase());
      if (existingUser) {
        return await handleExistingUser(ctx, existingUser, strategy, {
          providerUser: {
            id: user.sub,
            email: user.email,
            thumbnailUrl: user.picture,
            firstName: user.given_name,
            lastName: user.family_name,
          },
          redirectUrl: redirectExistingUserUrl,
          // TODO: invite token and email verification
          isEmailVerified: existingUser.emailVerified,
        });
      }

      const userId = nanoid();
      const redirectNewUserUrl = getRedirectUrl(ctx, true);
      // Create new user and oauth account
      return await handleCreateUser(
        ctx,
        {
          id: userId,
          slug: slugFromEmail(user.email),
          language: config.defaultLanguage,
          email: user.email.toLowerCase(),
          emailVerified: false,
          name: user.given_name,
          thumbnailUrl: user.picture,
          firstName: user.given_name,
          lastName: user.family_name,
        },
        {
          provider: {
            id: strategy,
            userId: user.sub,
          },
          redirectUrl: redirectNewUserUrl,
        },
      );
    } catch (error) {
      // Handle invalid credentials
      if (error instanceof OAuth2RequestError) {
        return errorResponse(ctx, 400, 'invalid_credentials', 'warn', undefined, { strategy });
      }

      if (error instanceof Error) {
        const errorMessage = error.message;
        logEvent('Error signing in with Microsoft', { strategy, errorMessage }, 'error');
      }

      throw error;
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
    setCookie(ctx, 'challenge', challengeBase64);
    return ctx.json({ challengeBase64 }, 200);
  })
  /*
   * Passkey registration
   */
  .openapi(authRoutesConfig.setPasskey, async (ctx) => {
    const { attestationObject, clientDataJSON, userEmail } = ctx.req.valid('json');

    const challengeFromCookie = getCookie(ctx, 'challenge');

    const { credentialId, publicKey } = parseAndValidatePasskeyAttestation(clientDataJSON, attestationObject, challengeFromCookie);
    // Save public key in the database

    await db.insert(passkeysTable).values({
      userEmail,
      credentialId,
      publicKey,
    });
    return ctx.json({ success: true }, 200);
  })
  /*
   * Verifies the passkey response
   */
  .openapi(authRoutesConfig.verifyPasskey, async (ctx) => {
    const { clientDataJSON, authenticatorData, signature, userEmail } = ctx.req.valid('json');

    // Retrieve user and challenge record
    const user = await getUserBy('email', userEmail.toLowerCase());
    if (!user) return errorResponse(ctx, 404, 'User not found', 'warn');

    const challengeFromCookie = getCookie(ctx, 'challenge');

    const [credential] = await db.select().from(passkeysTable).where(eq(passkeysTable.userEmail, userEmail));
    if (!credential) return errorResponse(ctx, 404, 'Credential not found', 'warn');

    try {
      const isValid = await verifyPassKeyPublic(signature, authenticatorData, clientDataJSON, credential.publicKey, challengeFromCookie);
      if (!isValid) return errorResponse(ctx, 400, 'Invalid signature', 'warn', undefined);
    } catch (error) {
      if (error instanceof Error) {
        const errorMessage = error.message;
        return errorResponse(ctx, 500, errorMessage || 'Passkey verification error', 'error', undefined);
      }
    }

    await setSessionCookie(ctx, user.id, 'passkey');
    return ctx.json({ success: true }, 200);
  });

export default authRoutes;
