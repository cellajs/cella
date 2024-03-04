import { OAuth2RequestError, generateCodeVerifier, generateState } from 'arctic';
import { and, eq } from 'drizzle-orm';
import { deleteCookie, getCookie } from 'hono/cookie';
import { isWithinExpirationDate } from 'oslo';

import { config } from 'config';
import { db } from '../../db/db';
import { githubAuth, googleAuth, microsoftAuth } from '../../db/lucia';
import { setCookie, setSessionCookie } from '../../lib/cookies';
import { customLogger } from '../../lib/custom-logger';
import { createError } from '../../lib/errors';
import { nanoid } from '../../lib/nanoid';
import { CustomHono } from '../../types/common';
import {
    githubSignInCallbackRoute,
    githubSignInRoute,
    googleSignInCallbackRoute,
    googleSignInRoute,
    microsoftSignInCallbackRoute,
    microsoftSignInRoute,
    sendVerificationEmailRoute,
} from './routes';
import { oauthAccountsTable } from '../../db/schema/oauthAccounts';
import { tokensTable } from '../../db/schema/tokens';
import { usersTable } from '../../db/schema/users';

const app = new CustomHono();

// routes
const oauthRoutes = app
  .openapi(githubSignInRoute, async (ctx) => {
    const { redirect } = ctx.req.valid('query');

    const state = generateState();
    const url = await githubAuth.createAuthorizationURL(state, {
      scopes: ['user:email'],
    });

    setCookie(ctx, 'oauth_state', state);

    if (redirect) {
      setCookie(ctx, 'oauth_redirect', redirect);
    }

    customLogger('User redirected to GitHub');

    return ctx.redirect(url.toString());
  })
  .openapi(githubSignInCallbackRoute, async (ctx) => {
    const { code, state } = ctx.req.valid('query');

    const stateCookie = getCookie(ctx, 'oauth_state');

    // verify state
    if (!state || !stateCookie || !code || stateCookie !== state) {
      return ctx.json(createError('error.invalid_state', 'Invalid state'), 400);
    }

    const redirectCookie = getCookie(ctx, 'oauth_redirect');
    let redirectUrl = config.frontendUrl + config.defaultRedirectPath;
    if (redirectCookie) redirectUrl = config.frontendUrl + decodeURIComponent(redirectCookie);

    try {
      const { accessToken } = await githubAuth.validateAuthorizationCode(code);
      const githubUserResponse = await fetch('https://api.github.com/user', {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
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

      const [existingOauthAccount] = await db
        .select()
        .from(oauthAccountsTable)
        .where(and(eq(oauthAccountsTable.providerId, 'GITHUB'), eq(oauthAccountsTable.providerUserId, String(githubUser.id))));

      if (existingOauthAccount) {
        await setSessionCookie(ctx, existingOauthAccount.userId, 'github');

        return ctx.json({}, 302, {
          Location: redirectUrl,
        });
      }

      const githubUserEmailsResponse = await fetch('https://api.github.com/user/emails', {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
      const githubUserEmails: {
        email: string;
        primary: boolean;
        verified: boolean;
        visibility: string | null;
      }[] = await githubUserEmailsResponse.json();

      const primaryEmail = githubUserEmails.find((email) => email.primary);

      if (!primaryEmail) {
        return ctx.json(createError('error.no_email_found', 'No email found'), 400);
      }

      const [slug] = primaryEmail.email.split('@');

      const [firstName, lastName] = githubUser.name ? githubUser.name.split(' ') : [slug, undefined];

      const inviteToken = getCookie(ctx, 'oauth_invite_token');

      deleteCookie(ctx, 'oauth_invite_token');

      let userEmail = primaryEmail.email;

      if (inviteToken) {
        const [token] = await db.select().from(tokensTable).where(eq(tokensTable.id, inviteToken));

        if (!token || !token.email || !isWithinExpirationDate(token.expiresAt)) {
          return ctx.json(createError('error.invalid_token', 'Invalid token'), 400);
        }

        userEmail = token.email;
      }

      const [existingUser] = await db.select().from(usersTable).where(eq(usersTable.email, userEmail));

      if (existingUser) {
        await db.insert(oauthAccountsTable).values({
          providerId: 'GITHUB',
          providerUserId: String(githubUser.id),
          userId: existingUser.id,
        });

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
          await fetch(config.backendUrl + sendVerificationEmailRoute.path, {
            method: sendVerificationEmailRoute.method,
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              email: primaryEmail.email,
            }),
          });

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
      await db.insert(oauthAccountsTable).values({
        providerId: 'GITHUB',
        providerUserId: String(githubUser.id),
        userId,
      });

      if (!primaryEmail.verified) {
        await fetch(config.backendUrl + sendVerificationEmailRoute.path, {
          method: sendVerificationEmailRoute.method,
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            email: primaryEmail.email,
          }),
        });

        return ctx.redirect(`${config.frontendUrl}/auth/verify-email`, 302);
      }

      await setSessionCookie(ctx, userId, 'github');

      return ctx.json({}, 302, {
        Location: config.frontendUrl + config.defaultRedirectPath,
      });
    } catch (error) {
      if (error instanceof OAuth2RequestError) {
        // bad verification code, invalid credentials, etc
        return ctx.json(createError('error.invalid_credentials', 'Invalid credentials'), 400);
      }

      customLogger('Error signing in with GitHub', { errorMessage: (error as Error).message }, 'error');

      throw error;
    }
  })
  .openapi(googleSignInRoute, async (ctx) => {
    const { redirect } = ctx.req.valid('query');

    const state = generateState();
    const codeVerifier = generateCodeVerifier();
    const url = await googleAuth.createAuthorizationURL(state, codeVerifier, {
      scopes: ['profile', 'email'],
    });

    setCookie(ctx, 'oauth_state', state);
    setCookie(ctx, 'oauth_code_verifier', codeVerifier);

    if (redirect) {
      setCookie(ctx, 'oauth_redirect', redirect);
    }

    customLogger('User redirected to Google');

    return ctx.json({}, 302, {
      Location: url.toString(),
    });
    // return ctx.redirect(url.toString(), 302);
  })
  .openapi(googleSignInCallbackRoute, async (ctx) => {
    const { state, code } = ctx.req.valid('query');

    const storedState = getCookie(ctx, 'oauth_state');
    const storedCodeVerifier = getCookie(ctx, 'oauth_code_verifier');

    // verify state
    if (!code || !storedState || !storedCodeVerifier || state !== storedState) {
      return ctx.json(createError('error.invalid_state', 'Invalid state'), 400);
    }

    const redirectCookie = getCookie(ctx, 'oauth_redirect');
    let redirectUrl = config.frontendUrl + config.defaultRedirectPath;
    if (redirectCookie) redirectUrl = config.frontendUrl + decodeURIComponent(redirectCookie);

    try {
      const { accessToken } = await googleAuth.validateAuthorizationCode(code, storedCodeVerifier);
      const response = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
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

      const [existingOauthAccount] = await db
        .select()
        .from(oauthAccountsTable)
        .where(and(eq(oauthAccountsTable.providerId, 'GOOGLE'), eq(oauthAccountsTable.providerUserId, user.sub)));

      if (existingOauthAccount) {
        await setSessionCookie(ctx, existingOauthAccount.userId, 'google');

        return ctx.json({}, 302, {
          Location: redirectUrl,
        });
      }

      const [existingUser] = await db.select().from(usersTable).where(eq(usersTable.email, user.email.toLowerCase()));

      if (existingUser) {
        await db.insert(oauthAccountsTable).values({
          providerId: 'GOOGLE',
          providerUserId: user.sub,
          userId: existingUser.id,
        });

        await setSessionCookie(ctx, existingUser.id, 'google');

        return ctx.json({}, 302, {
          Location: redirectUrl,
        });
      }

      const userId = nanoid();
      await db.insert(usersTable).values({
        id: userId,
        slug: userId,
        email: user.email.toLowerCase(),
        name: user.given_name,
        language: config.defaultLanguage,
        thumbnailUrl: user.picture,
        firstName: user.given_name,
        lastName: user.family_name,
      });
      await db.insert(oauthAccountsTable).values({
        providerId: 'GOOGLE',
        providerUserId: user.sub,
        userId,
      });

      await setSessionCookie(ctx, userId, 'google');

      return ctx.json({}, 302, {
        Location: config.frontendUrl + config.defaultRedirectPath,
      });
    } catch (error) {
      if (error instanceof OAuth2RequestError) {
        // bad verification code, invalid credentials, etc
        return ctx.json(createError('error.invalid_credentials', 'Invalid credentials'), 400);
      }

      const errorMessage = (error as Error).message;
      customLogger('Error signing in with Google', { errorMessage }, 'error');

      throw error;
    }
  })
  .openapi(microsoftSignInRoute, async (ctx) => {
    const { redirect } = ctx.req.valid('query');

    const state = generateState();
    const codeVerifier = generateCodeVerifier();
    const url = await microsoftAuth.createAuthorizationURL(state, codeVerifier, {
      scopes: ['profile', 'email'],
    });

    setCookie(ctx, 'oauth_state', state);
    setCookie(ctx, 'oauth_code_verifier', codeVerifier);

    if (redirect) {
      setCookie(ctx, 'oauth_redirect', redirect);
    }

    customLogger('User redirected to Microsoft');

    return ctx.json({}, 302, {
      Location: url.toString(),
    });
    // return ctx.redirect(url.toString(), 302);
  })
  .openapi(microsoftSignInCallbackRoute, async (ctx) => {
    const { state, code } = ctx.req.valid('query');

    const storedState = getCookie(ctx, 'oauth_state');
    const storedCodeVerifier = getCookie(ctx, 'oauth_code_verifier');

    // verify state
    if (!code || !storedState || !storedCodeVerifier || state !== storedState) {
      return ctx.json(createError('error.invalid_state', 'Invalid state'), 400);
    }

    const redirectCookie = getCookie(ctx, 'oauth_redirect');
    let redirectUrl = config.frontendUrl + config.defaultRedirectPath;
    if (redirectCookie) redirectUrl = config.frontendUrl + decodeURIComponent(redirectCookie);

    try {
      const { accessToken } = await microsoftAuth.validateAuthorizationCode(code, storedCodeVerifier);
      const response = await fetch('https://graph.microsoft.com/oidc/userinfo', {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
      const user: {
        sub: string;
        name: string;
        given_name: string;
        family_name: string;
        picture: string;
        email: string | undefined;
      } = await response.json();

      const [existingOauthAccount] = await db
        .select()
        .from(oauthAccountsTable)
        .where(and(eq(oauthAccountsTable.providerId, 'MICROSOFT'), eq(oauthAccountsTable.providerUserId, user.sub)));

      if (existingOauthAccount) {
        await setSessionCookie(ctx, existingOauthAccount.userId, 'microsoft');

        return ctx.json({}, 302, {
          Location: redirectUrl,
        });
      }

      if (!user.email) {
        return ctx.json(createError('error.no_email_found', 'No email found'), 400);
      }

      const [existingUser] = await db.select().from(usersTable).where(eq(usersTable.email, user.email.toLowerCase()));

      if (existingUser) {
        await db.insert(oauthAccountsTable).values({
          providerId: 'MICROSOFT',
          providerUserId: user.sub,
          userId: existingUser.id,
        });

        await setSessionCookie(ctx, existingUser.id, 'microsoft');

        return ctx.json({}, 302, {
          Location: redirectUrl,
        });
      }

      const userId = nanoid();
      await db.insert(usersTable).values({
        id: userId,
        slug: userId,
        language: config.defaultLanguage,
        email: user.email.toLowerCase(),
        name: user.given_name,
        thumbnailUrl: user.picture,
        firstName: user.given_name,
        lastName: user.family_name,
      });
      await db.insert(oauthAccountsTable).values({
        providerId: 'MICROSOFT',
        providerUserId: user.sub,
        userId,
      });

      await setSessionCookie(ctx, userId, 'microsoft');

      return ctx.json({}, 302, {
        Location: config.frontendUrl + config.defaultRedirectPath,
      });
    } catch (error) {
      if (error instanceof OAuth2RequestError) {
        // bad verification code, invalid credentials, etc
        return ctx.json(createError('error.invalid_credentials', 'Invalid credentials'), 400);
      }

      const errorMessage = (error as Error).message;
      customLogger('Error signing in with Microsoft', { errorMessage }, 'error');

      throw error;
    }
  });

export default oauthRoutes;
