import { OAuth2RequestError, generateCodeVerifier, generateState } from 'arctic';
import { eq } from 'drizzle-orm';
import { deleteCookie, getCookie } from 'hono/cookie';
import { isWithinExpirationDate } from 'oslo';

import { config } from 'config';
import slugify from 'slugify';
import { db } from '../../db/db';
import { githubAuth, googleAuth, microsoftAuth } from '../../db/lucia';
import { tokensTable } from '../../db/schema/tokens';
import { errorResponse } from '../../lib/errors';
import { nanoid } from '../../lib/nanoid';
import { logEvent } from '../../middlewares/logger/log-event';
import { CustomHono } from '../../types/common';
import { setSessionCookie } from './helpers/cookies';
import { createSession, findOauthAccount, findUserByEmail, getRedirectUrl, handleExistingUser, slugFromEmail, splitFullName } from './oauth-helpers';
import {
  githubSignInCallbackRouteConfig,
  githubSignInRouteConfig,
  googleSignInCallbackRouteConfig,
  googleSignInRouteConfig,
  microsoftSignInCallbackRouteConfig,
  microsoftSignInRouteConfig,
} from './routes';
import { handleCreateUser } from './helpers/user';

const app = new CustomHono();

const githubScopes = { scopes: ['user:email'] };
const googleScopes = { scopes: ['profile', 'email'] };
const microsoftScopes = { scopes: ['profile', 'email'] };

// * Oauth endpoints
const oauthRoutes = app
  /*
   * Github sign in
   */
  .openapi(githubSignInRouteConfig, async (ctx) => {
    const { redirect } = ctx.req.valid('query');

    const state = generateState();
    const url = await githubAuth.createAuthorizationURL(state, githubScopes);

    createSession(ctx, 'github', state, '', redirect);

    return ctx.redirect(url.toString());
  })
  /*
   * Google sign in
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
   * Microsoft sign in
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
   * Github sign in callback
   */
  .openapi(githubSignInCallbackRouteConfig, async (ctx) => {
    const { code, state } = ctx.req.valid('query');

    const stateCookie = getCookie(ctx, 'oauth_state');

    // * verify state
    if (!state || !stateCookie || !code || stateCookie !== state) {
      // t('common:error.invalid_state.text')
      return errorResponse(ctx, 400, 'invalid_state', 'warn', undefined, { strategy: 'github' });
    }

    const redirectUrl = getRedirectUrl(ctx);

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

        return ctx.redirect(redirectUrl);
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
          redirectUrl,
          isEmailVerified: existingUser.emailVerified || !!inviteToken || primaryEmail.verified,
        });
      }

      const userId = nanoid();

      // * Create new user and oauth account
      return await handleCreateUser(
        ctx,
        {
          id: userId,
          slug: slugify(githubUser.login, { lower: true }),
          email: primaryEmail.email.toLowerCase(),
          name: githubUser.name,
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
          redirectUrl,
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
   * Google sign in callback
   */
  .openapi(googleSignInCallbackRouteConfig, async (ctx) => {
    const { state, code } = ctx.req.valid('query');

    const storedState = getCookie(ctx, 'oauth_state');
    const storedCodeVerifier = getCookie(ctx, 'oauth_code_verifier');

    // * verify state
    if (!code || !storedState || !storedCodeVerifier || state !== storedState) {
      return errorResponse(ctx, 400, 'invalid_state', 'warn', undefined, { strategy: 'google' });
    }

    const redirectUrl = getRedirectUrl(ctx);

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

        return ctx.redirect(redirectUrl);
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
          redirectUrl,
          // TODO: invite token
          isEmailVerified: existingUser.emailVerified || user.email_verified,
        });
      }

      const userId = nanoid();

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
          redirectUrl,
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
   * Microsoft sign in callback
   */
  .openapi(microsoftSignInCallbackRouteConfig, async (ctx) => {
    const { state, code } = ctx.req.valid('query');

    const storedState = getCookie(ctx, 'oauth_state');
    const storedCodeVerifier = getCookie(ctx, 'oauth_code_verifier');

    // * verify state
    if (!code || !storedState || !storedCodeVerifier || state !== storedState) {
      return errorResponse(ctx, 400, 'invalid_state', 'warn', undefined, { strategy: 'microsoft' });
    }

    const redirectUrl = getRedirectUrl(ctx);

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

        return ctx.redirect(redirectUrl);
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
          redirectUrl,
          // TODO: invite token and email verification
          isEmailVerified: existingUser.emailVerified,
        });
      }

      const userId = nanoid();

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
          redirectUrl,
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

export default oauthRoutes;
