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
import { acceptInviteRoute, checkInviteRoute, githubSignInRoute } from './routes';

import { config } from 'config';
import { emailSender } from '../../../../email';
import { db } from '../../db/db';
import { membershipsTable } from '../../db/schema/memberships';
import { OrganizationModel, organizationsTable } from '../../db/schema/organizations';
import { tokensTable } from '../../db/schema/tokens';
import { usersTable } from '../../db/schema/users';
import { checkSlugExists } from '../../lib/check-slug';
import { removeSessionCookie, setSessionCookie } from '../../lib/cookies';
import { customLogger } from '../../lib/custom-logger';
import { createError, unauthorizedError } from '../../lib/errors';
import { nanoid } from '../../lib/nanoid';
import { transformDatabaseUser } from '../../lib/transform-database-user';
import { CustomHono, ErrorResponse } from '../../types/common';
import oauthRoutes from './oauth';
import {
  checkEmailRoute,
  resetPasswordCallbackRoute,
  resetPasswordRoute,
  sendVerificationEmailRoute,
  signInRoute,
  signOutRoute,
  signUpRoute,
  verifyEmailRoute,
} from './routes';

const app = new CustomHono();

// routes
const authRoutes = app
  .route('/', oauthRoutes)
  .openapi(signUpRoute, async (ctx) => {
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

      await fetch(config.backendUrl + sendVerificationEmailRoute.path, {
        method: sendVerificationEmailRoute.method,
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
        customLogger('User already exists', { email }, 'warn');

        return ctx.json(createError('error.email_exists', 'Email already exists'), 400);
      }

      customLogger('Error signing up', { errorMessage: (error as Error).message }, 'error');

      throw error;
    }
  })
  .openapi(verifyEmailRoute, async (ctx) => {
    const { resend } = ctx.req.valid('query');
    const verificationToken = ctx.req.valid('param').token;

    const [token] = await db.select().from(tokensTable).where(eq(tokensTable.id, verificationToken));
    // await db.delete(tokensTable).where(eq(tokensTable.id, verificationToken));

    if (!token || !token.userId || !isWithinExpirationDate(token.expiresAt)) {
      if (resend === 'true' && token && token.email) {
        fetch(config.backendUrl + sendVerificationEmailRoute.path, {
          method: sendVerificationEmailRoute.method,
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

      return ctx.json(createError('error.invalid_token_or_expired', 'Invalid token or expired'), 400);
    }

    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, token.userId));

    if (!user || user.email !== token.email) {
      if (resend === 'true' && token && token.email) {
        fetch(config.backendUrl + sendVerificationEmailRoute.path, {
          method: sendVerificationEmailRoute.method,
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

      return ctx.json(createError('error.invalid_token', 'Invalid token'), 400);
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
  .openapi(sendVerificationEmailRoute, async (ctx) => {
    const { email } = ctx.req.valid('json');

    const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email.toLowerCase()));

    if (!user) {
      return ctx.json(createError('error.no_email_found', 'No email found'), 400);
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

    customLogger('Verification email sent', { user: user.id });

    return ctx.json({
      success: true,
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
      return ctx.json(createError('error.invalid_email', 'Invalid email'), 400);
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

    customLogger('Reset password link sent', { user: user.id });

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
      return ctx.json(createError('error.invalid_token', 'Invalid token'), 400);
    }

    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, token.userId));

    if (!user || user.email !== token.email) {
      return ctx.json(createError('error.invalid_token', 'Invalid token'), 400);
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
  .openapi(signInRoute, async (ctx) => {
    const { email, password } = ctx.req.valid('json');

    const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email.toLowerCase()));

    if (!user || !user.hashedPassword) {
      return ctx.json(createError('error.invalid_email_or_password', 'Invalid email or password'), 400);
    }

    const validPassword = await new Argon2id().verify(user.hashedPassword, password);

    if (!validPassword) {
      return ctx.json(createError('error.invalid_email_or_password', 'Invalid email or password'), 400);
    }

    if (!user.emailVerified) {
      fetch(config.backendUrl + sendVerificationEmailRoute.path, {
        method: sendVerificationEmailRoute.method,
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

    const lastSignInAt = new Date();

    await db.update(usersTable).set({ lastSignInAt }).where(eq(usersTable.id, user.id));

    return ctx.json({
      success: true,
      data: transformDatabaseUser(user),
    });
  })
  .openapi(signOutRoute, async (ctx) => {
    const cookieHeader = ctx.req.raw.headers.get('Cookie');
    const sessionId = auth.readSessionCookie(cookieHeader ?? '');

    if (!sessionId) {
      removeSessionCookie(ctx);
      return ctx.json<ErrorResponse>(unauthorizedError(), 401);
    }

    const { session } = await auth.validateSession(sessionId);

    if (!session) {
      removeSessionCookie(ctx);
      return ctx.json(unauthorizedError(), 401);
    }

    await auth.invalidateSession(session.id);

    removeSessionCookie(ctx);
    customLogger('User signed out', { user: session.userId });

    return ctx.json({ success: true, data: undefined });
  })
  .openapi(checkInviteRoute, async (ctx) => {
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
        });
      }
    }

    return ctx.json({
      success: false,
    });
  })
  .openapi(acceptInviteRoute, async (ctx) => {
    const { password, oauth } = ctx.req.valid('json');
    const verificationToken = ctx.req.valid('param').token;

    const [token] = await db
      .select()
      .from(tokensTable)
      .where(and(eq(tokensTable.id, verificationToken)));

    if (!token || !token.email || !isWithinExpirationDate(token.expiresAt)) {
      return ctx.json(createError('error.invalid_token', 'Invalid token'), 400);
    }

    let organization: OrganizationModel | undefined;

    if (token.organizationId) {
      [organization] = await db.select().from(organizationsTable).where(eq(organizationsTable.id, token.organizationId));

      if (!organization) {
        return ctx.json(createError('error.organization_not_found', 'Organization not found'), 404);
      }
    }

    let user: User;

    if (token.userId) {
      [user] = await db
        .select()
        .from(usersTable)
        .where(and(eq(usersTable.id, token.userId)));

      if (!user || user.email !== token.email) {
        return ctx.json(createError('error.invalid_token', 'Invalid token'), 400);
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
        await db.delete(tokensTable).where(and(eq(tokensTable.id, verificationToken)));

        const session = await auth.createSession(userId, {});
        const sessionCookie = auth.createSessionCookie(session.id);

        ctx.header('Set-Cookie', sessionCookie.serialize());
      }
    } else {
      return ctx.json(createError('error.invalid_token', 'Invalid token'), 400);
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
      const response = await fetch(`${config.backendUrl + githubSignInRoute.path}${organization ? `?redirect=${organization.slug}` : ''}`, {
        method: githubSignInRoute.method,
        redirect: 'manual',
      });

      const url = response.headers.get('Location');

      if (response.status === 302 && url) {
        ctx.header('Set-Cookie', response.headers.get('Set-Cookie') ?? '', {
          append: true,
        });
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

      return ctx.json(createError('error.invalid_token', 'Invalid token'), 400);
    }

    return ctx.json({
      success: true,
      data: organization?.slug || '',
    });
  });

export default authRoutes;
