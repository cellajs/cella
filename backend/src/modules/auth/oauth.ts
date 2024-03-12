import { OAuth2RequestError, generateCodeVerifier, generateState } from 'arctic';
import { eq } from 'drizzle-orm';
import { deleteCookie, getCookie } from 'hono/cookie';
import { isWithinExpirationDate } from 'oslo';

import { config } from 'config';
import { db } from '../../db/db';
import { githubAuth, googleAuth, microsoftAuth } from '../../db/lucia';
import { tokensTable } from '../../db/schema/tokens';
import { usersTable } from '../../db/schema/users';
import { setSessionCookie } from '../../lib/cookies';
import { errorResponse } from '../../lib/errors';
import { nanoid } from '../../lib/nanoid';
import { logEvent } from '../../middlewares/logger/log-event';
import { CustomHono } from '../../types/common';
import { createSession, findOauthAccount, getRedirectUrl, insertOauthAccount } from './oauth-helpers';
import {
  githubSignInCallbackRouteConfig,
  githubSignInRouteConfig,
  googleSignInCallbackRouteConfig,
  googleSignInRouteConfig,
  microsoftSignInCallbackRouteConfig,
  microsoftSignInRouteConfig,
} from './routes';
import { sendVerificationEmail } from '../../lib/send-verification-email';

const app = new CustomHono();

const githubScopes = { scopes: ['user:email'] };
const googleScopes = { scopes: ['profile', 'email'] };
const microsoftScopes = { scopes: ['profile', 'email'] };

// Find user by email
const findUserByEmail = async (email: string) => {
  return db.select().from(usersTable).where(eq(usersTable.email, email));
};

// All oauth sign in and callback routes
const oauthRoutes = app
  .add(githubSignInRouteConfig, async (ctx) => {
    const { redirect } = ctx.req.valid('query');

    const state = generateState();
    const url = await githubAuth.createAuthorizationURL(state, githubScopes);

    createSession(ctx, 'github', state, '', redirect);

    return ctx.redirect(url.toString());
  })
  .add(googleSignInRouteConfig, async (ctx) => {
    const { redirect } = ctx.req.valid('query');

    const state = generateState();
    const codeVerifier = generateCodeVerifier();
    const url = await googleAuth.createAuthorizationURL(state, codeVerifier, googleScopes);

    createSession(ctx, 'google', state, codeVerifier, redirect);

    return ctx.json({}, 302, {
      Location: url.toString(),
    });
    // return ctx.redirect(url.toString(), 302);
  })
  .add(microsoftSignInRouteConfig, async (ctx) => {
    const { redirect } = ctx.req.valid('query');

    const state = generateState();
    const codeVerifier = generateCodeVerifier();
    const url = await microsoftAuth.createAuthorizationURL(state, codeVerifier, microsoftScopes);

    createSession(ctx, 'microsoft', state, codeVerifier, redirect);

    return ctx.json({}, 302, {
      Location: url.toString(),
    });
    // return ctx.redirect(url.toString(), 302);
  })
  .add(githubSignInCallbackRouteConfig, async (ctx) => {
    const { code, state } = ctx.req.valid('query');

    const stateCookie = getCookie(ctx, 'oauth_state');

    // verify state
    if (!state || !stateCookie || !code || stateCookie !== state) {
      return errorResponse(ctx, 400, 'invalid_state', 'warn', true, { strategy: 'github' });
    }

    const redirectUrl = getRedirectUrl(ctx);

    try {
      const { accessToken } = await githubAuth.validateAuthorizationCode(code);
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

      const [existingOauthAccount] = await findOauthAccount('GITHUB', String(githubUser.id));
      if (existingOauthAccount) {
        await setSessionCookie(ctx, existingOauthAccount.userId, 'github');

        return ctx.json({}, 302, {
          Location: redirectUrl,
        });
      }

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
        return errorResponse(ctx, 400, 'no_email_found', 'warn');
      }

      const [slug] = primaryEmail.email.split('@');
      const [firstName, lastName] = githubUser.name ? githubUser.name.split(' ') : [slug, undefined];

      const inviteToken = getCookie(ctx, 'oauth_invite_token');

      deleteCookie(ctx, 'oauth_invite_token');

      let userEmail = primaryEmail.email;

      if (inviteToken) {
        const [token] = await db.select().from(tokensTable).where(eq(tokensTable.id, inviteToken));

        if (!token || !token.email || !isWithinExpirationDate(token.expiresAt)) {
          return errorResponse(ctx, 400, 'invalid_token', 'warn', true, { strategy: 'github', type: 'invitation' });
        }

        userEmail = token.email;
      }

      const [existingUser] = await findUserByEmail(userEmail);

      if (existingUser) {
        await insertOauthAccount(existingUser.id, 'GITHUB', String(githubUser.id));

        const emailVerified = existingUser.emailVerified || !!inviteToken || primaryEmail.verified;

        await db
          .update(usersTable)
          .set({
            thumbnailUrl: existingUser.thumbnailUrl || githubUser.avatar_url,
            bio: existingUser.bio || githubUser.bio,
            emailVerified,
            firstName: existingUser.firstName || firstName,
            lastName: existingUser.lastName || lastName,
          })
          .where(eq(usersTable.id, existingUser.id));

        if (!emailVerified) {
          sendVerificationEmail(primaryEmail.email);

          return ctx.redirect(`${config.frontendUrl}/auth/verify-email`);
        }

        await setSessionCookie(ctx, existingUser.id, 'github');

        return ctx.json({}, 302, {
          Location: redirectUrl,
        });
      }

      const userId = nanoid();

      await db.insert(usersTable).values({
        id: userId,
        slug: githubUser.login,
        email: primaryEmail.email.toLowerCase(),
        name: githubUser.name,
        thumbnailUrl: githubUser.avatar_url,
        bio: githubUser.bio,
        emailVerified: primaryEmail.verified,
        language: config.defaultLanguage,
        firstName,
        lastName,
      });
      await insertOauthAccount(userId, 'GITHUB', String(githubUser.id));

      if (!primaryEmail.verified) {
        sendVerificationEmail(primaryEmail.email);

        return ctx.redirect(`${config.frontendUrl}/auth/verify-email`, 302);
      }

      await setSessionCookie(ctx, userId, 'github');

      return ctx.json({}, 302, {
        Location: config.frontendUrl + config.defaultRedirectPath,
      });
    } catch (error) {
      if (error instanceof OAuth2RequestError) {
        return errorResponse(ctx, 400, 'invalid_credentials', 'warn', true, { strategy: 'github' });
      }

      logEvent('Error signing in with GitHub', { strategy: 'github', errorMessage: (error as Error).message }, 'error');

      throw error;
    }
  })
  .add(googleSignInCallbackRouteConfig, async (ctx) => {
    const { state, code } = ctx.req.valid('query');

    const storedState = getCookie(ctx, 'oauth_state');
    const storedCodeVerifier = getCookie(ctx, 'oauth_code_verifier');

    // verify state
    if (!code || !storedState || !storedCodeVerifier || state !== storedState) {
      return errorResponse(ctx, 400, 'invalid_state', 'warn', true, { strategy: 'google' });
    }

    const redirectUrl = getRedirectUrl(ctx);

    try {
      const { accessToken } = await googleAuth.validateAuthorizationCode(code, storedCodeVerifier);
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

      const [existingOauthAccount] = await findOauthAccount('GOOGLE', user.sub);

      if (existingOauthAccount) {
        await setSessionCookie(ctx, existingOauthAccount.userId, 'google');

        return ctx.json({}, 302, {
          Location: redirectUrl,
        });
      }

      const [existingUser] = await findUserByEmail(user.email.toLowerCase());

      if (existingUser) {
        await insertOauthAccount(existingUser.id, 'GOOGLE', user.sub);
        await setSessionCookie(ctx, existingUser.id, 'google');

        return ctx.json({}, 302, {
          Location: redirectUrl,
        });
      }

      const userId = nanoid();
      await db.insert(usersTable).values({
        id: userId,
        slug: user.email.split('@')[0],
        email: user.email.toLowerCase(),
        name: user.given_name,
        language: config.defaultLanguage,
        thumbnailUrl: user.picture,
        firstName: user.given_name,
        lastName: user.family_name,
      });
      await insertOauthAccount(userId, 'GOOGLE', user.sub);

      await setSessionCookie(ctx, userId, 'google');

      return ctx.json({}, 302, {
        Location: config.frontendUrl + config.defaultRedirectPath,
      });
    } catch (error) {
      if (error instanceof OAuth2RequestError) {
        return errorResponse(ctx, 400, 'invalid_credentials', 'warn', true, { strategy: 'google' });
      }

      const errorMessage = (error as Error).message;
      logEvent('Error signing in with Google', { strategy: 'google', errorMessage }, 'error');

      throw error;
    }
  })

  .add(microsoftSignInCallbackRouteConfig, async (ctx) => {
    const { state, code } = ctx.req.valid('query');

    const storedState = getCookie(ctx, 'oauth_state');
    const storedCodeVerifier = getCookie(ctx, 'oauth_code_verifier');

    // verify state
    if (!code || !storedState || !storedCodeVerifier || state !== storedState) {
      return errorResponse(ctx, 400, 'invalid_state', 'warn', true, { strategy: 'microsoft' });
    }

    const redirectUrl = getRedirectUrl(ctx);

    try {
      const { accessToken } = await microsoftAuth.validateAuthorizationCode(code, storedCodeVerifier);
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

      const [existingOauthAccount] = await findOauthAccount('MICROSOFT', user.sub);

      if (existingOauthAccount) {
        await setSessionCookie(ctx, existingOauthAccount.userId, 'microsoft');

        return ctx.json({}, 302, {
          Location: redirectUrl,
        });
      }

      if (!user.email) {
        return errorResponse(ctx, 400, 'no_email_found', 'warn', true);
      }

      const [existingUser] = await findUserByEmail(user.email.toLowerCase());

      if (existingUser) {
        await insertOauthAccount(existingUser.id, 'MICROSOFT', user.sub);
        await setSessionCookie(ctx, existingUser.id, 'microsoft');

        return ctx.json({}, 302, {
          Location: redirectUrl,
        });
      }

      const userId = nanoid();
      await db.insert(usersTable).values({
        id: userId,
        slug: user.email.split('@')[0],
        language: config.defaultLanguage,
        email: user.email.toLowerCase(),
        name: user.given_name,
        thumbnailUrl: user.picture,
        firstName: user.given_name,
        lastName: user.family_name,
      });
      await insertOauthAccount(userId, 'MICROSOFT', user.sub);
      await setSessionCookie(ctx, userId, 'microsoft');

      return ctx.json({}, 302, {
        Location: config.frontendUrl + config.defaultRedirectPath,
      });
    } catch (error) {
      if (error instanceof OAuth2RequestError) {
        return errorResponse(ctx, 400, 'invalid_credentials', 'warn', true, { strategy: 'microsoft' });
      }

      const errorMessage = (error as Error).message;
      logEvent('Error signing in with Microsoft', { strategy: 'microsoft', errorMessage }, 'error');

      throw error;
    }
  });

export default oauthRoutes;
