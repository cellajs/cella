import { render } from '@react-email/render';
import { and, eq } from 'drizzle-orm';
import { User, generateId } from 'lucia';
import { TimeSpan, createDate, isWithinExpirationDate } from 'oslo';
import postgres from 'postgres';
import { VerificationEmail } from '../../../../email/emails/email-verification';
import { ResetPasswordEmail } from '../../../../email/emails/reset-password';

import { Argon2id } from 'oslo/password';
import { auth } from '../../db/lucia';
import { setCookie } from '../../lib/cookies';
import { acceptInviteRouteConfig, checkInviteRouteConfig, githubSignInRouteConfig } from './routes';

import { config } from 'config';
import { emailSender } from '../../../../email';
import { db } from '../../db/db';
import { membershipsTable } from '../../db/schema/memberships';
import { OrganizationModel, organizationsTable } from '../../db/schema/organizations';
import { tokensTable } from '../../db/schema/tokens';
import { usersTable } from '../../db/schema/users';
import { checkSlugExists } from '../../lib/check-slug';
import { removeSessionCookie, setSessionCookie } from '../../lib/cookies';
import { errorResponse } from '../../lib/errors';
import { nanoid } from '../../lib/nanoid';
import { transformDatabaseUser } from '../../lib/transform-database-user';
import { logEvent } from '../../middlewares/logger/log-event';
import { CustomHono } from '../../types/common';
import oauthRoutes from './oauth';
import {
  checkEmailRouteConfig,
  resetPasswordCallbackRouteConfig,
  resetPasswordRouteConfig,
  sendVerificationEmailRouteConfig,
  signInRouteConfig,
  signOutRouteConfig,
  signUpRouteConfig,
  verifyEmailRouteConfig,
} from './routes';

const app = new CustomHono();

// routes
const authRoutes = app
  .add(signUpRouteConfig, async (ctx) => {
    const { email, password } = ctx.req.valid('json');

    const hashedPassword = await new Argon2id().hash(password);
    const userId = nanoid();

    const [slug] = email.split('@');

    const slugExists = await checkSlugExists(slug);

    try {
      await db
        .insert(usersTable)
        .values({
          id: userId,
          slug: slugExists ? `${slug}-${userId}` : slug,
          firstName: slug,
          email: email.toLowerCase(),
          language: config.defaultLanguage,
          hashedPassword,
        })
        .returning();

      await fetch(config.backendUrl + sendVerificationEmailRouteConfig.route.path, {
        method: sendVerificationEmailRouteConfig.route.method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email,
        }),
      });

      return ctx.json({
        success: true,
      });
    } catch (error) {
      if (error instanceof postgres.PostgresError && error.message.startsWith('duplicate key')) {
        return errorResponse(ctx, 409, 'error.email_exists', 'warn', true, { email });
      }

      logEvent('Error signing up', { errorMessage: (error as Error).message }, 'error');

      throw error;
    }
  })
  .add(verifyEmailRouteConfig, async (ctx) => {
    const { resend } = ctx.req.valid('query');
    const verificationToken = ctx.req.valid('param').token;

    const [token] = await db.select().from(tokensTable).where(eq(tokensTable.id, verificationToken));
    // await db.delete(tokensTable).where(eq(tokensTable.id, verificationToken));

    if (!token || !token.userId || !isWithinExpirationDate(token.expiresAt)) {
      if (resend === 'true' && token && token.email) {
        fetch(config.backendUrl + sendVerificationEmailRouteConfig.route.path, {
          method: sendVerificationEmailRouteConfig.route.method,
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            email: token.email,
          }),
        });
        await db.delete(tokensTable).where(eq(tokensTable.id, verificationToken));

        return ctx.json({
          success: true,
        });
      }

      return errorResponse(ctx, 400, 'invalid_token_or_expired', 'warn', true, { user: token?.userId || 'na', type: 'verification' });
    }

    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, token.userId));

    if (!user || user.email !== token.email) {
      if (resend === 'true' && token && token.email) {
        fetch(config.backendUrl + sendVerificationEmailRouteConfig.route.path, {
          method: sendVerificationEmailRouteConfig.route.method,
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            email: token.email,
          }),
        });
        await db.delete(tokensTable).where(eq(tokensTable.id, verificationToken));

        return ctx.json({
          success: true,
        });
      }

      return errorResponse(ctx, 400, 'invalid_token', 'warn');
    }

    await db
      .update(usersTable)
      .set({
        emailVerified: true,
      })
      .where(eq(usersTable.id, user.id));

    await setSessionCookie(ctx, user.id, 'email_verification');

    return ctx.json({
      success: true,
    });
  })
  .add(sendVerificationEmailRouteConfig, async (ctx) => {
    const { email } = ctx.req.valid('json');

    const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email.toLowerCase()));

    if (!user) {
      return errorResponse(ctx, 400, 'email_not_found', 'warn', true, { email });
    }

    // creating email verification token
    await db.delete(tokensTable).where(eq(tokensTable.userId, user.id));
    const token = generateId(40);
    await db.insert(tokensTable).values({
      id: token,
      type: 'EMAIL_VERIFICATION',
      userId: user.id,
      email,
      expiresAt: createDate(new TimeSpan(2, 'h')),
    });

    const emailHtml = render(
      VerificationEmail({
        verificationLink: `${config.frontendUrl}/auth/verify-email/${token}`,
      }),
    );

    emailSender.send(email, 'Verify email for Cella', emailHtml);

    logEvent('Verification email sent', { user: user.id });

    return ctx.json({
      success: true,
    });
  })
  .add(checkEmailRouteConfig, async (ctx) => {
    const { email } = ctx.req.valid('json');

    const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email.toLowerCase()));

    return ctx.json({
      success: true,
      data: {
        exists: !!user,
      },
    });
  })
  .add(resetPasswordRouteConfig, async (ctx) => {
    const { email } = ctx.req.valid('json');

    const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email.toLowerCase()));

    if (!user || !user.emailVerified) {
      return errorResponse(ctx, 400, 'invalid_email', 'warn', true, { email });
    }

    // creating password reset token
    await db.delete(tokensTable).where(eq(tokensTable.userId, user.id));
    const token = generateId(40);
    await db.insert(tokensTable).values({
      id: token,
      type: 'PASSWORD_RESET',
      userId: user.id,
      email,
      expiresAt: createDate(new TimeSpan(2, 'h')),
    });

    const emailHtml = render(
      ResetPasswordEmail({
        resetPasswordLink: `${config.frontendUrl}/auth/reset-password/${token}`,
      }),
    );

    emailSender.send(email, 'Reset Cella password', emailHtml);

    logEvent('Reset password link sent', { user: user.id });

    return ctx.json({
      success: true,
      data: undefined,
    });
  })
  .add(resetPasswordCallbackRouteConfig, async (ctx) => {
    const { password } = ctx.req.valid('json');
    const verificationToken = ctx.req.valid('param').token;

    const [token] = await db.select().from(tokensTable).where(eq(tokensTable.id, verificationToken));
    await db.delete(tokensTable).where(eq(tokensTable.id, verificationToken));

    if (!token || !token.userId || !isWithinExpirationDate(token.expiresAt)) {
      return errorResponse(ctx, 400, 'invalid_token_or_expired', 'warn');
    }

    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, token.userId));

    if (!user || user.email !== token.email) {
      return errorResponse(ctx, 404, 'user_by_token_not_found', 'warn', true, { userId: token.userId });
    }

    await auth.invalidateUserSessions(user.id);
    const hashedPassword = await new Argon2id().hash(password);
    await db.update(usersTable).set({ hashedPassword }).where(eq(usersTable.id, user.id));

    await setSessionCookie(ctx, user.id, 'password_reset');

    return ctx.json({
      success: true,
      data: undefined,
    });
  })
  .add(signInRouteConfig, async (ctx) => {
    const { email, password } = ctx.req.valid('json');

    const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email.toLowerCase()));

    if (!user || !user.hashedPassword) {
      return errorResponse(ctx, 404, 'user_by_email_not_found', 'warn');
    }

    const validPassword = await new Argon2id().verify(user.hashedPassword, password);

    if (!validPassword) {
      return errorResponse(ctx, 400, 'invalid_password', 'warn');
    }

    // Send verify email first
    if (!user.emailVerified) {
      fetch(config.backendUrl + sendVerificationEmailRouteConfig.route.path, {
        method: sendVerificationEmailRouteConfig.route.method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email,
        }),
      });

      return ctx.redirect(`${config.frontendUrl}/auth/verify-email`);
    }

    await setSessionCookie(ctx, user.id, 'password');

    return ctx.json({
      success: true,
      data: transformDatabaseUser(user),
    });
  })
  .add(signOutRouteConfig, async (ctx) => {
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

    return ctx.json({ success: true, data: undefined });
  })
  .add(checkInviteRouteConfig, async (ctx) => {
    const token = ctx.req.valid('param').token;

    const [tokenRecord] = await db
      .select()
      .from(tokensTable)
      .where(and(eq(tokensTable.id, token)));

    if (tokenRecord?.email) {
      const [user] = await db.select().from(usersTable).where(eq(usersTable.email, tokenRecord.email));

      if (user) {
        return ctx.json({
          success: true,
          data: tokenRecord.email,
        });
      }
    }

    return errorResponse(ctx, 404, 'invite_not_found', 'warn');
  })
  .add(acceptInviteRouteConfig, async (ctx) => {
    const { password, oauth } = ctx.req.valid('json');
    const verificationToken = ctx.req.valid('param').token;

    const [token] = await db
      .select()
      .from(tokensTable)
      .where(and(eq(tokensTable.id, verificationToken)));

    if (!token || !token.email || !isWithinExpirationDate(token.expiresAt)) {
      return errorResponse(ctx, 400, 'invalid_token_or_expired', 'warn');
    }

    let organization: OrganizationModel | undefined;

    if (token.organizationId) {
      [organization] = await db.select().from(organizationsTable).where(eq(organizationsTable.id, token.organizationId));

      if (!organization) {
        return errorResponse(ctx, 404, 'organization_not_found', 'warn', true, { organizationId: token.organizationId });
      }
    }

    let user: User;

    if (token.userId) {
      [user] = await db
        .select()
        .from(usersTable)
        .where(and(eq(usersTable.id, token.userId)));

      if (!user || user.email !== token.email) {
        return errorResponse(ctx, 400, 'invalid_token', 'warn', true, { userId: token.userId, type: 'invitation' });
      }
    } else if (password || oauth) {
      const hashedPassword = password ? await new Argon2id().hash(password) : undefined;
      const userId = nanoid();

      const [slug] = token.email.split('@');

      const slugExists = await checkSlugExists(slug);

      [user] = await db
        .insert(usersTable)
        .values({
          id: userId,
          slug: slugExists ? `${slug}-${userId}` : slug,
          language: organization?.defaultLanguage || config.defaultLanguage,
          email: token.email,
          emailVerified: true,
          hashedPassword,
        })
        .returning();

      if (password) {
        await Promise.all([db.delete(tokensTable).where(and(eq(tokensTable.id, verificationToken))), setSessionCookie(ctx, user.id, 'password')]);
      }
    } else {
      return errorResponse(ctx, 400, 'invalid_token', 'warn', true, { type: 'invitation' });
    }

    if (organization) {
      await db
        .insert(membershipsTable)
        .values({
          organizationId: organization.id,
          userId: user.id,
          role: 'MEMBER',
          createdBy: user.id,
        })
        .returning();
    }

    if (oauth === 'github') {
      const response = await fetch(
        `${config.backendUrl + githubSignInRouteConfig.route.path}${organization ? `?redirect=${organization.slug}` : ''}`,
        {
          method: githubSignInRouteConfig.route.method,
          redirect: 'manual',
        },
      );

      const url = response.headers.get('Location');

      if (response.status === 302 && url) {
        ctx.header('Set-Cookie', response.headers.get('Set-Cookie') ?? '', { append: true });
        setCookie(ctx, 'oauth_invite_token', verificationToken);

        return ctx.json({
          success: true,
          data: url,
        });

        // return ctx.json({}, 302, {
        //   Location: url,
        // });
        // return ctx.redirect(url, 302);
      }

      return errorResponse(ctx, 400, 'invalid_token', 'warn', true, { type: 'invitation' });
    }

    return ctx.json({
      success: true,
      data: organization?.slug || '',
    });
  });

export default authRoutes.route('/', oauthRoutes);
