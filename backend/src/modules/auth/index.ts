import { render } from '@react-email/render';
import { and, eq } from 'drizzle-orm';
import { type User, generateId } from 'lucia';
import { TimeSpan, createDate, isWithinExpirationDate } from 'oslo';
import postgres from 'postgres';
import { VerificationEmail } from '../../../../email/emails/email-verification';
import { ResetPasswordEmail } from '../../../../email/emails/reset-password';

import { Argon2id } from 'oslo/password';
import { auth } from '../../db/lucia';
import { setCookie } from './helpers/cookies';
import { acceptInviteRouteConfig, githubSignInRouteConfig } from './routes';

import { config } from 'config';
import { emailSender } from '../../../../email';
import { db } from '../../db/db';
import { type MembershipModel, membershipsTable } from '../../db/schema/memberships';
import { type OrganizationModel, organizationsTable } from '../../db/schema/organizations';
import { tokensTable } from '../../db/schema/tokens';
import { usersTable } from '../../db/schema/users';
import { errorResponse } from '../../lib/errors';
import { i18n } from '../../lib/i18n';
import { nanoid } from '../../lib/nanoid';
import { logEvent } from '../../middlewares/logger/log-event';
import { CustomHono } from '../../types/common';
import { checkSlugAvailable } from '../general/helpers/check-slug';
import { transformDatabaseUser } from '../users/helpers/transform-database-user';
import { removeSessionCookie, setSessionCookie } from './helpers/cookies';
import { sendVerificationEmail } from './helpers/verify-email';
import oauthRoutes from './oauth';
import { slugFromEmail } from './oauth-helpers';
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

// * Authentication endpoints
const authRoutes = app
  /*
   * Sign up with email and password
   */
  .openapi(signUpRouteConfig, async (ctx) => {
    const { email, password } = ctx.req.valid('json');

    const hashedPassword = await new Argon2id().hash(password);
    const userId = nanoid();

    const slug = slugFromEmail(email);

    const slugAvailable = await checkSlugAvailable(slug);

    try {
      await db
        .insert(usersTable)
        .values({
          id: userId,
          slug: slugAvailable ? slug : `${slug}-${userId}`,
          firstName: slug,
          email: email.toLowerCase(),
          language: config.defaultLanguage,
          hashedPassword,
        })
        .returning();

      await sendVerificationEmail(email);

      return ctx.json({
        success: true,
      });
    } catch (error) {
      if (error instanceof postgres.PostgresError && error.message.startsWith('duplicate key')) {
        // t('common:error.email_exists')
        return errorResponse(ctx, 409, 'email_exists', 'warn', undefined);
      }

      logEvent('Error signing up', { errorMessage: (error as Error).message }, 'error');

      throw error;
    }
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

        return ctx.json({
          success: true,
        });
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
  /*
   * Send verification email
   */
  .openapi(sendVerificationEmailRouteConfig, async (ctx) => {
    const { email } = ctx.req.valid('json');

    const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email.toLowerCase()));

    if (!user) {
      return errorResponse(ctx, 404, 'not_found', 'warn', 'user');
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

    return ctx.json({
      success: true,
    });
  })
  /*
   * Check if email exists
   */
  .openapi(checkEmailRouteConfig, async (ctx) => {
    const { email } = ctx.req.valid('json');

    const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email.toLowerCase()));

    return ctx.json({
      success: true,
      data: {
        exists: !!user,
      },
    });
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

    return ctx.json({
      success: true,
      data: undefined,
    });
  })
  /*
   * Reset password with token
   */
  .openapi(resetPasswordCallbackRouteConfig, async (ctx) => {
    const { password } = ctx.req.valid('json');
    const verificationToken = ctx.req.valid('param').token;

    const [token] = await db.select().from(tokensTable).where(eq(tokensTable.id, verificationToken));
    await db.delete(tokensTable).where(eq(tokensTable.id, verificationToken));

    if (!token || !token.userId || !isWithinExpirationDate(token.expiresAt)) {
      return errorResponse(ctx, 400, 'invalid_token', 'warn');
    }

    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, token.userId));

    if (!user || user.email !== token.email) {
      return errorResponse(ctx, 404, 'not_found', 'warn', 'user', { userId: token.userId });
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
  /*
   * Sign in with email and password
   */
  .openapi(signInRouteConfig, async (ctx) => {
    const { email, password } = ctx.req.valid('json');

    const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email.toLowerCase()));

    if (!user || !user.hashedPassword) {
      return errorResponse(ctx, 404, 'not_found', 'warn', 'user');
    }

    const validPassword = await new Argon2id().verify(user.hashedPassword, password);

    if (!validPassword) {
      // t('common:error.invalid_password')
      return errorResponse(ctx, 400, 'invalid_password', 'warn');
    }

    // * send verify email first
    if (!user.emailVerified) {
      sendVerificationEmail(email);

      return ctx.redirect(`${config.frontendUrl}/auth/verify-email`);
    }

    await setSessionCookie(ctx, user.id, 'password');

    return ctx.json({
      success: true,
      data: transformDatabaseUser(user),
    });
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

    return ctx.json({ success: true, data: undefined });
  })
  /*
   * Accept invite token
   */
  .openapi(acceptInviteRouteConfig, async (ctx) => {
    const { password, oauth } = ctx.req.valid('json');
    const verificationToken = ctx.req.valid('param').token;

    const [token] = await db
      .select()
      .from(tokensTable)
      .where(and(eq(tokensTable.id, verificationToken)));

    if (!token || !token.email || !isWithinExpirationDate(token.expiresAt)) {
      // t('common:error.invalid_token_or_expired')
      return errorResponse(ctx, 400, 'invalid_token_or_expired', 'warn');
    }

    let organization: OrganizationModel | undefined;

    if (token.organizationId) {
      [organization] = await db.select().from(organizationsTable).where(eq(organizationsTable.id, token.organizationId));

      if (!organization) {
        return errorResponse(ctx, 404, 'not_found', 'warn', 'organization', {
          organizationId: token.organizationId,
        });
      }
    }

    let user: User;

    if (token.userId) {
      [user] = await db
        .select()
        .from(usersTable)
        .where(and(eq(usersTable.id, token.userId)));

      if (!user || user.email !== token.email) {
        return errorResponse(ctx, 400, 'invalid_token', 'warn', undefined, {
          userId: token.userId,
          type: 'invitation',
        });
      }
    } else if (password || oauth) {
      const hashedPassword = password ? await new Argon2id().hash(password) : undefined;
      const userId = nanoid();

      const slug = slugFromEmail(token.email);

      const slugAvailable = await checkSlugAvailable(slug);

      [user] = await db
        .insert(usersTable)
        .values({
          id: userId,
          slug: slugAvailable ? slug : `${slug}-${userId}`,
          language: organization?.defaultLanguage || config.defaultLanguage,
          email: token.email,
          role: (token.role as User['role']) || 'USER',
          emailVerified: true,
          hashedPassword,
        })
        .returning();

      if (password) {
        await Promise.all([db.delete(tokensTable).where(and(eq(tokensTable.id, verificationToken))), setSessionCookie(ctx, user.id, 'password')]);
      }
    } else {
      return errorResponse(ctx, 400, 'invalid_token', 'warn', undefined, {
        type: 'invitation',
      });
    }

    if (organization) {
      await db
        .insert(membershipsTable)
        .values({
          organizationId: organization.id,
          userId: user.id,
          role: (token.role as MembershipModel['role']) || 'MEMBER',
          createdBy: user.id,
        })
        .returning();
    }

    if (oauth === 'github') {
      const response = await fetch(
        `${config.backendUrl + githubSignInRouteConfig.path}${organization ? `?redirect=${organization.slug}` : ''}`,
        {
          method: githubSignInRouteConfig.method,
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

        // TODO: Fix redirect
        // return ctx.json({}, 302, {
        //   Location: url,
        // });
        // return ctx.redirect(url, 302);
      }

      // t('common:error.invalid_invitation')
      return errorResponse(ctx, 400, 'invalid_invitation', 'warn', undefined, {
        type: 'invitation',
      });
    }

    return ctx.json({
      success: true,
      data: organization?.slug || '',
    });
  });

const allRoutes = authRoutes.route('/', oauthRoutes);

export default allRoutes;

export type AuthRoutes = typeof allRoutes;
