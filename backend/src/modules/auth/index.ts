import { render } from '@react-email/render';
import { eq } from 'drizzle-orm';
import { generateId } from 'lucia';
import { TimeSpan, createDate, isWithinExpirationDate } from 'oslo';
import { VerificationEmail } from '../../../../email/emails/email-verification';
import { ResetPasswordEmail } from '../../../../email/emails/reset-password';

import { Argon2id } from 'oslo/password';
import { auth } from '../../db/lucia';

import { OAuth2RequestError, generateCodeVerifier, generateState } from 'arctic';
import { deleteCookie, getCookie } from 'hono/cookie';

import slugify from 'slugify';
import { githubAuth, googleAuth, microsoftAuth } from '../../db/lucia';

import { createSession, findOauthAccount, findUserByEmail, getRedirectUrl, handleExistingUser, slugFromEmail, splitFullName } from './helpers/oauth';

import { config } from 'config';
import type { z } from 'zod';
import { emailSender } from '../../../../email';
import { db } from '../../db/db';
import { tokensTable } from '../../db/schema/tokens';
import { usersTable } from '../../db/schema/users';
import { errorResponse } from '../../lib/errors';
import { i18n } from '../../lib/i18n';
import { nanoid } from '../../lib/nanoid';
import { logEvent } from '../../middlewares/logger/log-event';
import { CustomHono } from '../../types/common';
import { checkTokenRouteConfig } from '../general/routes';
import { transformDatabaseUser } from '../users/helpers/transform-database-user';
import { removeSessionCookie, setSessionCookie } from './helpers/cookies';
import { handleCreateUser } from './helpers/user';
import { sendVerificationEmail } from './helpers/verify-email';
import {
  checkEmailRouteConfig,
  githubSignInCallbackRouteConfig,
  githubSignInRouteConfig,
  googleSignInCallbackRouteConfig,
  googleSignInRouteConfig,
  microsoftSignInCallbackRouteConfig,
  microsoftSignInRouteConfig,
  resetPasswordCallbackRouteConfig,
  resetPasswordRouteConfig,
  sendVerificationEmailRouteConfig,
  signInRouteConfig,
  signOutRouteConfig,
  signUpRouteConfig,
  verifyEmailRouteConfig,
} from './routes';

// Scopes for OAuth providers
const githubScopes = { scopes: ['user:email'] };
const googleScopes = { scopes: ['profile', 'email'] };
const microsoftScopes = { scopes: ['profile', 'email'] };

const app = new CustomHono();

type CheckTokenResponse = z.infer<(typeof checkTokenRouteConfig.responses)['200']['content']['application/json']['schema']> | undefined;
type TokenData = Extract<CheckTokenResponse, { data: unknown }>['data'];

// * Authentication endpoints
const authRoutes = app
  /*
   * Check if email exists
   */
  .openapi(checkEmailRouteConfig, async (ctx) => {
    const { email } = ctx.req.valid('json');

    const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email.toLowerCase()));

    return ctx.json(
      {
        success: true,
        data: {
          exists: !!user,
        },
      },
      200,
    );
  })
  /*
   * Sign up with email and password
   */
  .openapi(signUpRouteConfig, async (ctx) => {
    const { email, password, token } = ctx.req.valid('json');

    let tokenData: TokenData | undefined;
    if (token) {
      const response = await fetch(`${config.backendUrl + checkTokenRouteConfig.path.replace('{token}', token)}`);

      const data = (await response.json()) as CheckTokenResponse;
      tokenData = data?.data;
    }

    // * hash password
    const hashedPassword = await new Argon2id().hash(password);
    const userId = nanoid();

    const slug = slugFromEmail(email);

    const isEmailVerified = tokenData?.email === email;

    // * create user and send verification email
    await handleCreateUser(
      ctx,
      {
        id: userId,
        slug,
        name: slug,
        email: email.toLowerCase(),
        language: config.defaultLanguage,
        hashedPassword,
      },
      {
        isEmailVerified,
      },
    );

    return ctx.json(
      {
        success: true,
      },
      200,
    );
  })
  /*
   * Send verification email
   */
  .openapi(sendVerificationEmailRouteConfig, async (ctx) => {
    const { email } = ctx.req.valid('json');

    const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email.toLowerCase()));

    if (!user) {
      return errorResponse(ctx, 404, 'not_found', 'warn', 'USER');
    }

    // * creating email verification token
    await db.delete(tokensTable).where(eq(tokensTable.userId, user.id));
    const token = generateId(40);
    await db.insert(tokensTable).values({
      id: token,
      type: 'EMAIL_VERIFICATION',
      userId: user.id,
      email,
      expiresAt: createDate(new TimeSpan(2, 'h')),
    });

    const emailLanguage = user?.language || config.defaultLanguage;

    // * generating email html
    const emailHtml = render(
      VerificationEmail({
        i18n: i18n.cloneInstance({
          lng: i18n.languages.includes(emailLanguage) ? emailLanguage : config.defaultLanguage,
        }),
        verificationLink: `${config.frontendUrl}/auth/verify-email/${token}`,
      }),
    );

    emailSender.send(email, 'Verify email for Cella', emailHtml);

    logEvent('Verification email sent', { user: user.id });

    return ctx.json({ success: true }, 200);
  })
  /*
   * Verify email
   */
  .openapi(verifyEmailRouteConfig, async (ctx) => {
    const { resend } = ctx.req.valid('query');
    const verificationToken = ctx.req.valid('param').token;

    const [token] = await db.select().from(tokensTable).where(eq(tokensTable.id, verificationToken));

    // * If the token is not found or expired
    if (!token || !token.userId || !isWithinExpirationDate(token.expiresAt)) {
      // * If 'resend' is true and the token has an email we will resend the email
      if (resend === 'true' && token && token.email) {
        sendVerificationEmail(token.email);

        await db.delete(tokensTable).where(eq(tokensTable.id, verificationToken));

        return ctx.json(
          {
            success: true,
          },
          200,
        );
      }

      // t('common:error.invalid_token')
      return errorResponse(ctx, 400, 'invalid_token', 'warn', undefined, {
        user: token?.userId || 'na',
        type: 'verification',
      });
    }

    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, token.userId));

    // * If the user is not found or the email is different from the token email
    if (!user || user.email !== token.email) {
      // * If 'resend' is true and the token has an email we will resend the email
      if (resend === 'true' && token && token.email) {
        sendVerificationEmail(token.email);

        await db.delete(tokensTable).where(eq(tokensTable.id, verificationToken));

        return ctx.json(
          {
            success: true,
          },
          200,
        );
      }

      return errorResponse(ctx, 400, 'invalid_token', 'warn');
    }

    await db
      .update(usersTable)
      .set({
        emailVerified: true,
      })
      .where(eq(usersTable.id, user.id));

    // Sign in user
    await setSessionCookie(ctx, user.id, 'email_verification');

    return ctx.json({ success: true }, 200);
  })
  /*
   * Request reset password email with token
   */
  .openapi(resetPasswordRouteConfig, async (ctx) => {
    const { email } = ctx.req.valid('json');

    const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email.toLowerCase()));

    if (!user || !user.emailVerified) {
      // t('common:error.invalid_email')
      return errorResponse(ctx, 400, 'invalid_email', 'warn');
    }

    // * creating password reset token
    await db.delete(tokensTable).where(eq(tokensTable.userId, user.id));
    const token = generateId(40);
    await db.insert(tokensTable).values({
      id: token,
      type: 'PASSWORD_RESET',
      userId: user.id,
      email,
      expiresAt: createDate(new TimeSpan(2, 'h')),
    });

    const emailLanguage = user?.language || config.defaultLanguage;

    // * generating email html
    const emailHtml = render(
      ResetPasswordEmail({
        i18n: i18n.cloneInstance({
          lng: i18n.languages.includes(emailLanguage) ? emailLanguage : config.defaultLanguage,
        }),
        resetPasswordLink: `${config.frontendUrl}/auth/reset-password/${token}`,
      }),
    );

    emailSender.send(email, 'Reset Cella password', emailHtml);

    logEvent('Reset password link sent', { user: user.id });

    return ctx.json({ success: true }, 200);
  })
  /*
   * Reset password with token
   */
  .openapi(resetPasswordCallbackRouteConfig, async (ctx) => {
    const { password } = ctx.req.valid('json');
    const verificationToken = ctx.req.valid('param').token;

    const [token] = await db.select().from(tokensTable).where(eq(tokensTable.id, verificationToken));
    await db.delete(tokensTable).where(eq(tokensTable.id, verificationToken));

    // * If the token is not found or expired
    if (!token || !token.userId || !isWithinExpirationDate(token.expiresAt)) {
      return errorResponse(ctx, 400, 'invalid_token', 'warn');
    }

    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, token.userId));

    // * If the user is not found or the email is different from the token email
    if (!user || user.email !== token.email) {
      return errorResponse(ctx, 404, 'not_found', 'warn', 'USER', { userId: token.userId });
    }

    await auth.invalidateUserSessions(user.id);

    // * hash password
    const hashedPassword = await new Argon2id().hash(password);

    // * update user password
    await db.update(usersTable).set({ hashedPassword }).where(eq(usersTable.id, user.id));

    // Sign in user
    await setSessionCookie(ctx, user.id, 'password_reset');

    return ctx.json({ success: true }, 200);
  })
  /*
   * Sign in with email and password
   */
  .openapi(signInRouteConfig, async (ctx) => {
    const { email, password, token } = ctx.req.valid('json');

    let tokenData: TokenData | undefined;
    if (token) {
      const response = await fetch(`${config.backendUrl + checkTokenRouteConfig.path.replace('{token}', token)}`);

      const data = (await response.json()) as CheckTokenResponse;
      tokenData = data?.data;
    }

    const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email.toLowerCase()));

    // * If the user is not found or signed up with oauth
    if (!user || !user.hashedPassword) {
      return errorResponse(ctx, 404, 'not_found', 'warn', 'USER');
    }

    const validPassword = await new Argon2id().verify(user.hashedPassword, password);

    if (!validPassword) {
      return errorResponse(ctx, 400, 'invalid_password', 'warn');
    }

    const isEmailVerified = user.emailVerified || tokenData?.email === user.email;

    // * send verify email first
    if (!isEmailVerified) {
      sendVerificationEmail(email);

      // return ctx.redirect(`${config.frontendUrl}/auth/verify-email`);
      // return ctx.json({}, 302, {
      //   Location: `${config.frontendUrl}/auth/verify-email`,
      // });
    } else {
      await setSessionCookie(ctx, user.id, 'password');
    }

    return ctx.json(
      {
        success: true,
        data: transformDatabaseUser(user),
      },
      200,
    );
  })
  /*
   * Sign out
   */
  .openapi(signOutRouteConfig, async (ctx) => {
    const cookieHeader = ctx.req.raw.headers.get('Cookie');
    const sessionId = auth.readSessionCookie(cookieHeader ?? '');

    if (!sessionId) {
      removeSessionCookie(ctx);
      return errorResponse(ctx, 401, 'unauthorized', 'warn');
    }

    const { session } = await auth.validateSession(sessionId);

    if (session) {
      await auth.invalidateSession(session.id);
    }

    removeSessionCookie(ctx);
    logEvent('User signed out', { user: session?.userId || 'na' });

    return ctx.json({ success: true }, 200);
  })
  /*
   * Github authentication
   */
  .openapi(githubSignInRouteConfig, async (ctx) => {
    const { redirect } = ctx.req.valid('query');

    const state = generateState();
    const url = await githubAuth.createAuthorizationURL(state, githubScopes);

    createSession(ctx, 'github', state, '', redirect);

    return ctx.redirect(url.toString());
  })
  /*
   * Google authentication
   */
  .openapi(googleSignInRouteConfig, async (ctx) => {
    const { redirect } = ctx.req.valid('query');

    const state = generateState();
    const codeVerifier = generateCodeVerifier();
    const url = await googleAuth.createAuthorizationURL(state, codeVerifier, googleScopes);

    createSession(ctx, 'google', state, codeVerifier, redirect);

    return ctx.redirect(url.toString());
  })
  /*
   * Microsoft authentication
   */
  .openapi(microsoftSignInRouteConfig, async (ctx) => {
    const { redirect } = ctx.req.valid('query');

    const state = generateState();
    const codeVerifier = generateCodeVerifier();
    const url = await microsoftAuth.createAuthorizationURL(state, codeVerifier, microsoftScopes);

    createSession(ctx, 'microsoft', state, codeVerifier, redirect);

    return ctx.redirect(url.toString());
  })
  /*
   * Github authentication callback
   */
  .openapi(githubSignInCallbackRouteConfig, async (ctx) => {
    const { code, state } = ctx.req.valid('query');

    const stateCookie = getCookie(ctx, 'oauth_state');

    // * verify state
    if (!state || !stateCookie || !code || stateCookie !== state) {
      // t('common:error.invalid_state.text')
      return errorResponse(ctx, 400, 'invalid_state', 'warn', undefined, { strategy: 'github' });
    }

    const redirectExistingUserUrl = getRedirectUrl(ctx);

    try {
      const { accessToken } = await githubAuth.validateAuthorizationCode(code);

      // * Get user info from github
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

      // * Check if oauth account already exists
      const [existingOauthAccount] = await findOauthAccount('GITHUB', String(githubUser.id));
      if (existingOauthAccount) {
        await setSessionCookie(ctx, existingOauthAccount.userId, 'github');

        return ctx.redirect(redirectExistingUserUrl);
      }

      // * Get user emails from github
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

      // * Check if user has an invite token
      const inviteToken = getCookie(ctx, 'oauth_invite_token');

      deleteCookie(ctx, 'oauth_invite_token');

      const githubUserEmail = primaryEmail.email.toLowerCase();
      let userEmail = githubUserEmail;

      if (inviteToken) {
        const [token] = await db.select().from(tokensTable).where(eq(tokensTable.id, inviteToken));

        // * If token is invalid or expired
        if (!token || !token.email || !isWithinExpirationDate(token.expiresAt)) {
          return errorResponse(ctx, 400, 'invalid_token', 'warn', undefined, { strategy: 'github', type: 'invitation' });
        }

        userEmail = token.email;
      }

      // * Check if user already exists
      const [existingUser] = await findUserByEmail(userEmail);
      if (existingUser) {
        return await handleExistingUser(ctx, existingUser, 'GITHUB', {
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
      // * Create new user and oauth account
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
            id: 'GITHUB',
            userId: String(githubUser.id),
          },
          isEmailVerified: primaryEmail.verified,
          redirectUrl: redirectNewUserUrl,
        },
      );
    } catch (error) {
      // * Handle invalid credentials
      if (error instanceof OAuth2RequestError) {
        // t('common:error.invalid_credentials.text')
        return errorResponse(ctx, 400, 'invalid_credentials', 'warn', undefined, { strategy: 'github' });
      }

      logEvent('Error signing in with GitHub', { strategy: 'github', errorMessage: (error as Error).message }, 'error');

      throw error;
    }
  })
  /*
   * Google authentication callback
   */
  .openapi(googleSignInCallbackRouteConfig, async (ctx) => {
    const { state, code } = ctx.req.valid('query');

    const storedState = getCookie(ctx, 'oauth_state');
    const storedCodeVerifier = getCookie(ctx, 'oauth_code_verifier');

    // * verify state
    if (!code || !storedState || !storedCodeVerifier || state !== storedState) {
      return errorResponse(ctx, 400, 'invalid_state', 'warn', undefined, { strategy: 'google' });
    }

    const redirectExistingUserUrl = getRedirectUrl(ctx);

    try {
      const { accessToken } = await googleAuth.validateAuthorizationCode(code, storedCodeVerifier);

      // * Get user info from google
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

      // * Check if oauth account already exists
      const [existingOauthAccount] = await findOauthAccount('GOOGLE', user.sub);
      if (existingOauthAccount) {
        await setSessionCookie(ctx, existingOauthAccount.userId, 'google');

        return ctx.redirect(redirectExistingUserUrl);
      }

      // * Check if user already exists
      const [existingUser] = await findUserByEmail(user.email.toLowerCase());
      if (existingUser) {
        return await handleExistingUser(ctx, existingUser, 'GOOGLE', {
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
      // * Create new user and oauth account
      return await handleCreateUser(
        ctx,
        {
          id: userId,
          slug: slugFromEmail(user.email),
          email: user.email.toLowerCase(),
          name: user.given_name,
          language: config.defaultLanguage,
          thumbnailUrl: user.picture,
          firstName: user.given_name,
          lastName: user.family_name,
        },
        {
          provider: {
            id: 'GOOGLE',
            userId: user.sub,
          },
          isEmailVerified: user.email_verified,
          redirectUrl: redirectNewUserUrl,
        },
      );
    } catch (error) {
      // * Handle invalid credentials
      if (error instanceof OAuth2RequestError) {
        return errorResponse(ctx, 400, 'invalid_credentials', 'warn', undefined, { strategy: 'google' });
      }

      const errorMessage = (error as Error).message;
      logEvent('Error signing in with Google', { strategy: 'google', errorMessage }, 'error');

      throw error;
    }
  })
  /*
   * Microsoft authentication callback
   */
  .openapi(microsoftSignInCallbackRouteConfig, async (ctx) => {
    const { state, code } = ctx.req.valid('query');

    const storedState = getCookie(ctx, 'oauth_state');
    const storedCodeVerifier = getCookie(ctx, 'oauth_code_verifier');

    // * verify state
    if (!code || !storedState || !storedCodeVerifier || state !== storedState) {
      return errorResponse(ctx, 400, 'invalid_state', 'warn', undefined, { strategy: 'microsoft' });
    }

    const redirectExistingUserUrl = getRedirectUrl(ctx);

    try {
      const { accessToken } = await microsoftAuth.validateAuthorizationCode(code, storedCodeVerifier);

      // * Get user info from microsoft
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

      // * Check if oauth account already exists
      const [existingOauthAccount] = await findOauthAccount('MICROSOFT', user.sub);
      if (existingOauthAccount) {
        await setSessionCookie(ctx, existingOauthAccount.userId, 'microsoft');

        return ctx.redirect(redirectExistingUserUrl);
      }

      if (!user.email) {
        return errorResponse(ctx, 400, 'no_email_found', 'warn', undefined);
      }

      // * Check if user already exists
      const [existingUser] = await findUserByEmail(user.email.toLowerCase());
      if (existingUser) {
        return await handleExistingUser(ctx, existingUser, 'MICROSOFT', {
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
      // * Create new user and oauth account
      return await handleCreateUser(
        ctx,
        {
          id: userId,
          slug: slugFromEmail(user.email),
          language: config.defaultLanguage,
          email: user.email.toLowerCase(),
          name: user.given_name,
          thumbnailUrl: user.picture,
          firstName: user.given_name,
          lastName: user.family_name,
        },
        {
          provider: {
            id: 'MICROSOFT',
            userId: user.sub,
          },
          isEmailVerified: false,
          redirectUrl: redirectNewUserUrl,
        },
      );
    } catch (error) {
      // * Handle invalid credentials
      if (error instanceof OAuth2RequestError) {
        return errorResponse(ctx, 400, 'invalid_credentials', 'warn', undefined, { strategy: 'microsoft' });
      }

      const errorMessage = (error as Error).message;
      logEvent('Error signing in with Microsoft', { strategy: 'microsoft', errorMessage }, 'error');

      throw error;
    }
  });

export default authRoutes;
