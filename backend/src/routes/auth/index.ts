import { render } from '@react-email/render';
import { OAuth2RequestError, generateCodeVerifier, generateState } from 'arctic';
import { and, eq } from 'drizzle-orm';
import VerificationEmail from 'emails/emails/email-verification';
import ResetPasswordEmail from 'emails/emails/reset-password';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { generateId } from 'lucia';
import { TimeSpan, createDate, isWithinExpirationDate } from 'oslo';
import { Argon2id } from 'oslo/password';
import postgres from 'postgres';

import config from 'config';
import emailSender from 'emails/index';
import { getI18n } from 'i18n';
import { db } from '../../db/db';
import { auth, githubAuth, googleAuth, microsoftAuth } from '../../db/lucia';
import { oauthAccountsTable, tokensTable, usersTable } from '../../db/schema';
import { createError, unauthorizedError } from '../../lib/errors';
import { nanoid } from '../../lib/nanoid';
import { transformDatabaseUser } from '../../lib/transform-database-user';
import { CustomHono, ErrorResponse } from '../../types/common';
import { customLogger } from '../middlewares/custom-logger';
import { checkSlugRoute } from '../users/schema';
import {
  checkEmailRoute,
  githubSignInCallbackRoute,
  githubSignInRoute,
  googleSignInCallbackRoute,
  googleSignInRoute,
  microsoftSignInCallbackRoute,
  microsoftSignInRoute,
  resetPasswordCallbackRoute,
  resetPasswordRoute,
  sendVerificationEmailRoute,
  signInRoute,
  signOutRoute,
  signUpRoute,
  verifyEmailRoute,
} from './schema';

const i18n = getI18n('backend');

const app = new CustomHono();

// routes
const authRoutes = app
  .openapi(signUpRoute, async (ctx) => {
    const { email, password } = ctx.req.valid('json');

    const hashedPassword = await new Argon2id().hash(password);
    const userId = nanoid();

    const [slug] = email.split('@');

    const response = await fetch(`${config.backendUrl + checkSlugRoute.path.replace('{slug}', slug)}`, {
      method: checkSlugRoute.method,
    });

    const { data: slugExists } = (await response.json()) as { data: boolean };

    try {
      const [user] = await db
        .insert(usersTable)
        .values({
          id: userId,
          slug: slugExists ? `${slug}-${userId}` : slug,
          firstName: slug,
          email: email.toLowerCase(),
          hashedPassword,
        })
        .returning();

      await fetch(config.backendUrl + sendVerificationEmailRoute.path, {
        method: sendVerificationEmailRoute.method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email,
        }),
      });

      // const session = await auth.createSession(userId, {});
      // const sessionCookie = auth.createSessionCookie(session.id);

      // ctx.header('Set-Cookie', sessionCookie.serialize());

      // customLogger('User signed up', {
      //   userId: user.id,
      //   userSlug: user.slug,
      // });

      return ctx.json({
        success: true,
        data: transformDatabaseUser(user),
      });
    } catch (error) {
      if (error instanceof postgres.PostgresError && error.message.startsWith('duplicate key')) {
        customLogger('User already exists', { email }, 'warn');

        return ctx.json(createError(i18n, 'error.email_already_exists', 'Email already exists'), 400);
      }

      customLogger(
        'Error signing up',
        {
          errorMessage: (error as Error).message,
        },
        'error',
      );

      throw error;
    }
  })
  .openapi(verifyEmailRoute, async (ctx) => {
    const verificationToken = ctx.req.valid('param').token;

    const [token] = await db.select().from(tokensTable).where(eq(tokensTable.id, verificationToken));
    await db.delete(tokensTable).where(eq(tokensTable.id, verificationToken));

    if (!token || !token.userId || !isWithinExpirationDate(token.expiresAt)) {
      return ctx.json(createError(i18n, 'error.invalid_token', 'Invalid token'), 400);
    }

    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, token.userId));

    if (!user || user.email !== token.email) {
      return ctx.json(createError(i18n, 'error.invalid_token', 'Invalid token'), 400);
    }

    await db
      .update(usersTable)
      .set({
        emailVerified: true,
      })
      .where(eq(usersTable.id, user.id));

    const session = await auth.createSession(user.id, {});
    const sessionCookie = auth.createSessionCookie(session.id);

    ctx.header('Set-Cookie', sessionCookie.serialize());

    customLogger('Email verified and user signed in', {
      userId: user.id,
      userSlug: user.slug,
    });

    return ctx.redirect(config.frontendUrl, 302);
  })
  .openapi(sendVerificationEmailRoute, async (ctx) => {
    const { email } = ctx.req.valid('json');

    const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email.toLowerCase()));

    if (!user) {
      return ctx.json(createError(i18n, 'error.no_email_found', 'No email found'), 400);
    }

    // creating email verification token
    await db.delete(tokensTable).where(eq(tokensTable.userId, user.id));
    const verificationToken = generateId(40);
    await db.insert(tokensTable).values({
      id: verificationToken,
      userId: user.id,
      email,
      expiresAt: createDate(new TimeSpan(2, 'h')),
    });

    const emailHtml = render(
      VerificationEmail({
        verificationLink: `${config.backendUrl}/verify-email/${verificationToken}`,
        i18n,
      }),
    );

    emailSender.send(email, 'Verify email for Cella', emailHtml);

    customLogger('Verification email sent', {
      userId: user.id,
      userSlug: user.slug,
    });

    return ctx.json({
      success: true,
      data: undefined,
    });
  })
  .openapi(checkEmailRoute, async (ctx) => {
    const { email } = ctx.req.valid('json');

    const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email.toLowerCase()));

    return ctx.json({
      success: true,
      data: {
        exists: !!user,
      },
    });
  })
  .openapi(resetPasswordRoute, async (ctx) => {
    const { email } = ctx.req.valid('json');

    const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email.toLowerCase()));

    if (!user || !user.emailVerified) {
      return ctx.json(createError(i18n, 'error.invalid_email', 'Invalid email'), 400);
    }

    // creating password reset token
    await db.delete(tokensTable).where(eq(tokensTable.userId, user.id));
    const verificationToken = generateId(40);
    await db.insert(tokensTable).values({
      id: verificationToken,
      userId: user.id,
      email,
      expiresAt: createDate(new TimeSpan(2, 'h')),
    });

    const emailHtml = render(
      ResetPasswordEmail({
        resetPasswordLink: `${config.frontendUrl}/auth/reset-password/${verificationToken}`,
        i18n,
      }),
    );

    emailSender.send(email, 'Reset Cella password', emailHtml);

    customLogger('Reset pasword link sent', {
      userId: user.id,
      userSlug: user.slug,
    });

    return ctx.json({
      success: true,
      data: undefined,
    });
  })
  .openapi(resetPasswordCallbackRoute, async (ctx) => {
    const { password } = ctx.req.valid('json');
    const verificationToken = ctx.req.valid('param').token;

    const [token] = await db.select().from(tokensTable).where(eq(tokensTable.id, verificationToken));
    await db.delete(tokensTable).where(eq(tokensTable.id, verificationToken));

    if (!token || !token.userId || !isWithinExpirationDate(token.expiresAt)) {
      return ctx.json(createError(i18n, 'error.invalid_token', 'Invalid token'), 400);
    }

    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, token.userId));

    if (!user || user.email !== token.email) {
      return ctx.json(createError(i18n, 'error.invalid_token', 'Invalid token'), 400);
    }

    await auth.invalidateUserSessions(user.id);
    const hashedPassword = await new Argon2id().hash(password);
    await db
      .update(usersTable)
      .set({
        hashedPassword,
      })
      .where(eq(usersTable.id, user.id));

    const session = await auth.createSession(user.id, {});
    const sessionCookie = auth.createSessionCookie(session.id);

    ctx.header('Set-Cookie', sessionCookie.serialize());

    customLogger('Password reset and user signed in', {
      userId: user.id,
      userSlug: user.slug,
    });

    return ctx.json({
      success: true,
      data: undefined,
    });
  })
  .openapi(signInRoute, async (ctx) => {
    const { email, password } = ctx.req.valid('json');

    const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email.toLowerCase()));

    if (!user || !user.hashedPassword) {
      return ctx.json(createError(i18n, 'error.invalid_email_or_password', 'Invalid email or password'), 400);
    }

    const validPassword = await new Argon2id().verify(user.hashedPassword, password);

    if (!validPassword) {
      return ctx.json(createError(i18n, 'error.invalid_email_or_password', 'Invalid email or password'), 400);
    }

    if (!user.emailVerified) {
      await fetch(config.backendUrl + sendVerificationEmailRoute.path, {
        method: sendVerificationEmailRoute.method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email,
        }),
      });

      return ctx.redirect(`${config.frontendUrl}/auth/verify-email`, 302);
    }

    const session = await auth.createSession(user.id, {});
    const sessionCookie = auth.createSessionCookie(session.id);

    await db
      .update(usersTable)
      .set({
        lastSignInAt: new Date(),
      })
      .where(eq(usersTable.id, user.id));

    ctx.header('Set-Cookie', sessionCookie.serialize());

    customLogger('User signed in', {
      userId: user.id,
      userSlug: user.slug,
    });

    return ctx.json({
      success: true,
      data: transformDatabaseUser(user),
    });
  })
  .openapi(githubSignInRoute, async (ctx) => {
    const { redirect } = ctx.req.valid('query');

    const state = generateState();
    const url = await githubAuth.createAuthorizationURL(state, {
      scopes: ['user:email'],
    });

    setCookie(ctx, 'oauth_state', state, {
      secure: config.mode === 'production', // set `Secure` flag in HTTPS
      path: '/',
      httpOnly: true,
      maxAge: 60 * 10, // 10 min
    });

    if (redirect) {
      setCookie(ctx, 'oauth_redirect', redirect, {
        secure: config.mode === 'production', // set `Secure` flag in HTTPS
        path: '/',
        httpOnly: true,
        maxAge: 60 * 10, // 10 min
      });
    }

    customLogger('User redirected to GitHub');

    return ctx.redirect(url.toString(), 302);
  })
  .openapi(githubSignInCallbackRoute, async (ctx) => {
    const { code, state } = ctx.req.valid('query');

    const stateCookie = getCookie(ctx, 'oauth_state');

    // verify state
    if (!state || !stateCookie || !code || stateCookie !== state) {
      return ctx.json(createError(i18n, 'error.invalid_state', 'Invalid state'), 400);
    }

    const redirectCookie = getCookie(ctx, 'oauth_redirect');
    const redirectUrl = redirectCookie ? config.frontendUrl + decodeURIComponent(redirectCookie) : config.frontendUrl;

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
        const session = await auth.createSession(existingOauthAccount.userId, {});
        const sessionCookie = auth.createSessionCookie(session.id);

        ctx.header('Set-Cookie', sessionCookie.serialize());

        customLogger('User signed in with GitHub', {
          userId: existingOauthAccount.userId,
        });

        return ctx.json({}, 302, {
          Location: redirectUrl,
        });
        // return ctx.redirect(config.frontendUrl, 302);
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
        return ctx.json(createError(i18n, 'error.no_email_found', 'No email found'), 400);
      }

      const [slug] = primaryEmail.email.split('@');

      const [firstName, lastName] = githubUser.name ? githubUser.name.split(' ') : [slug, undefined];

      const inviteToken = getCookie(ctx, 'oauth_invite_token');

      deleteCookie(ctx, 'oauth_invite_token');

      let userEmail = primaryEmail.email;

      if (inviteToken) {
        const [token] = await db.select().from(tokensTable).where(eq(tokensTable.id, inviteToken));

        if (!token || !token.email || !isWithinExpirationDate(token.expiresAt)) {
          return ctx.json(createError(i18n, 'error.invalid_token', 'Invalid token'), 400);
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

          return ctx.redirect(`${config.frontendUrl}/auth/verify-email`, 302);
        }

        const session = await auth.createSession(existingUser.id, {});
        const sessionCookie = auth.createSessionCookie(session.id);

        ctx.header('Set-Cookie', sessionCookie.serialize());

        customLogger('User signed in with GitHub', {
          userId: existingUser.id,
        });

        return ctx.json({}, 302, {
          Location: redirectUrl,
        });
        // return ctx.redirect(config.frontendUrl, 302);
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

      const session = await auth.createSession(userId, {});
      const sessionCookie = auth.createSessionCookie(session.id);

      ctx.header('Set-Cookie', sessionCookie.serialize());

      customLogger('User signed in with GitHub', {
        userId,
      });

      return ctx.json({}, 302, {
        Location: config.frontendUrl,
      });
      // return ctx.redirect(config.frontendUrl, 302);
    } catch (error) {
      if (error instanceof OAuth2RequestError) {
        // bad verification code, invalid credentials, etc
        return ctx.json(createError(i18n, 'error.invalid_credentials', 'Invalid credentials'), 400);
      }

      customLogger(
        'Error signing in with GitHub',
        {
          errorMessage: (error as Error).message,
        },
        'error',
      );

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

    setCookie(ctx, 'oauth_state', state, {
      secure: config.mode === 'production', // set `Secure` flag in HTTPS
      path: '/',
      httpOnly: true,
      maxAge: 60 * 10, // 10 min
    });

    setCookie(ctx, 'oauth_code_verifier', codeVerifier, {
      secure: config.mode === 'production', // set `Secure` flag in HTTPS
      path: '/',
      httpOnly: true,
      maxAge: 60 * 10, // 10 min
    });

    if (redirect) {
      setCookie(ctx, 'oauth_redirect', redirect, {
        secure: config.mode === 'production', // set `Secure` flag in HTTPS
        path: '/',
        httpOnly: true,
        maxAge: 60 * 10, // 10 min
      });
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
      return ctx.json(createError(i18n, 'error.invalid_state', 'Invalid state'), 400);
    }

    const redirectCookie = getCookie(ctx, 'oauth_redirect');
    const redirectUrl = redirectCookie ? config.frontendUrl + decodeURIComponent(redirectCookie) : config.frontendUrl;

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
        const session = await auth.createSession(existingOauthAccount.userId, {});
        const sessionCookie = auth.createSessionCookie(session.id);

        ctx.header('Set-Cookie', sessionCookie.serialize());

        customLogger('User signed in with Google', {
          userId: existingOauthAccount.userId,
        });

        return ctx.json({}, 302, {
          Location: redirectUrl,
        });
        // return ctx.redirect(config.frontendUrl, 302);
      }

      const [existingUser] = await db.select().from(usersTable).where(eq(usersTable.email, user.email.toLowerCase()));

      if (existingUser) {
        await db.insert(oauthAccountsTable).values({
          providerId: 'GOOGLE',
          providerUserId: user.sub,
          userId: existingUser.id,
        });

        const session = await auth.createSession(existingUser.id, {});
        const sessionCookie = auth.createSessionCookie(session.id);

        ctx.header('Set-Cookie', sessionCookie.serialize());

        customLogger('User signed in with Google', {
          userId: existingUser.id,
        });

        return ctx.json({}, 302, {
          Location: redirectUrl,
        });
        // return ctx.redirect(config.frontendUrl, 302);
      }

      const userId = nanoid();
      await db.insert(usersTable).values({
        id: userId,
        slug: userId,
        email: user.email.toLowerCase(),
        name: user.given_name,
        thumbnailUrl: user.picture,
        firstName: user.given_name,
        lastName: user.family_name,
      });
      await db.insert(oauthAccountsTable).values({
        providerId: 'GOOGLE',
        providerUserId: user.sub,
        userId,
      });

      const session = await auth.createSession(userId, {});
      const sessionCookie = auth.createSessionCookie(session.id);

      ctx.header('Set-Cookie', sessionCookie.serialize());

      customLogger('User signed in with Google', {
        userId,
      });

      return ctx.json({}, 302, {
        Location: config.frontendUrl,
      });
      // return ctx.redirect(config.frontendUrl, 302);
    } catch (error) {
      if (error instanceof OAuth2RequestError) {
        // bad verification code, invalid credentials, etc
        return ctx.json(createError(i18n, 'error.invalid_credentials', 'Invalid credentials'), 400);
      }

      customLogger(
        'Error signing in with Google',
        {
          errorMessage: (error as Error).message,
        },
        'error',
      );

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

    setCookie(ctx, 'oauth_state', state, {
      secure: config.mode === 'production', // set `Secure` flag in HTTPS
      path: '/',
      httpOnly: true,
      maxAge: 60 * 10, // 10 min
    });

    setCookie(ctx, 'oauth_code_verifier', codeVerifier, {
      secure: config.mode === 'production', // set `Secure` flag in HTTPS
      path: '/',
      httpOnly: true,
      maxAge: 60 * 10, // 10 min
    });

    if (redirect) {
      setCookie(ctx, 'oauth_redirect', redirect, {
        secure: config.mode === 'production', // set `Secure` flag in HTTPS
        path: '/',
        httpOnly: true,
        maxAge: 60 * 10, // 10 min
      });
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
      return ctx.json(createError(i18n, 'error.invalid_state', 'Invalid state'), 400);
    }

    const redirectCookie = getCookie(ctx, 'oauth_redirect');
    const redirectUrl = redirectCookie ? config.frontendUrl + decodeURIComponent(redirectCookie) : config.frontendUrl;

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
        const session = await auth.createSession(existingOauthAccount.userId, {});
        const sessionCookie = auth.createSessionCookie(session.id);

        ctx.header('Set-Cookie', sessionCookie.serialize());

        customLogger('User signed in with Microsoft', {
          userId: existingOauthAccount.userId,
        });

        return ctx.json({}, 302, {
          Location: redirectUrl,
        });
        // return ctx.redirect(config.frontendUrl, 302);
      }

      if (!user.email) {
        return ctx.json(createError(i18n, 'error.no_email_found', 'No email found'), 400);
      }

      const [existingUser] = await db.select().from(usersTable).where(eq(usersTable.email, user.email.toLowerCase()));

      if (existingUser) {
        await db.insert(oauthAccountsTable).values({
          providerId: 'MICROSOFT',
          providerUserId: user.sub,
          userId: existingUser.id,
        });

        const session = await auth.createSession(existingUser.id, {});
        const sessionCookie = auth.createSessionCookie(session.id);

        ctx.header('Set-Cookie', sessionCookie.serialize());

        customLogger('User signed in with Microsoft', {
          userId: existingUser.id,
        });

        return ctx.json({}, 302, {
          Location: redirectUrl,
        });
        // return ctx.redirect(config.frontendUrl, 302);
      }

      const userId = nanoid();
      await db.insert(usersTable).values({
        id: userId,
        slug: userId,
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

      const session = await auth.createSession(userId, {});
      const sessionCookie = auth.createSessionCookie(session.id);

      ctx.header('Set-Cookie', sessionCookie.serialize());

      customLogger('User signed in with Microsoft', {
        userId,
      });

      return ctx.json({}, 302, {
        Location: config.frontendUrl,
      });
      // return ctx.redirect(config.frontendUrl, 302);
    } catch (error) {
      if (error instanceof OAuth2RequestError) {
        // bad verification code, invalid credentials, etc
        return ctx.json(createError(i18n, 'error.invalid_credentials', 'Invalid credentials'), 400);
      }

      customLogger(
        'Error signing in with Microsoft',
        {
          errorMessage: (error as Error).message,
        },
        'error',
      );

      throw error;
    }
  })
  .openapi(signOutRoute, async (ctx) => {
    const cookieHeader = ctx.req.raw.headers.get('Cookie');
    const sessionId = auth.readSessionCookie(cookieHeader ?? '');

    if (!sessionId) {
      customLogger('User not authenticated');

      const sessionCookie = auth.createBlankSessionCookie();
      ctx.header('Set-Cookie', sessionCookie.serialize());

      return ctx.json<ErrorResponse>(unauthorizedError(i18n), 401);
    }

    const { session } = await auth.validateSession(sessionId);

    if (!session) {
      customLogger('User not authenticated');

      const sessionCookie = auth.createBlankSessionCookie();
      ctx.header('Set-Cookie', sessionCookie.serialize());

      return ctx.json(unauthorizedError(i18n), 401);
    }

    await auth.invalidateSession(session.id);
    ctx.header('Set-Cookie', auth.createBlankSessionCookie().serialize());

    customLogger('User signed out');

    return ctx.json({ success: true, data: undefined });
  });

export default authRoutes;
