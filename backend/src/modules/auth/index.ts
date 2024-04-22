import { render } from '@react-email/render';
import { eq } from 'drizzle-orm';
import { generateId } from 'lucia';
import { TimeSpan, createDate, isWithinExpirationDate } from 'oslo';
import { VerificationEmail } from '../../../../email/emails/email-verification';
import { ResetPasswordEmail } from '../../../../email/emails/reset-password';

import { Argon2id } from 'oslo/password';
import { auth } from '../../db/lucia';

import { config } from 'config';
import { emailSender } from '../../../../email';
import { db } from '../../db/db';
import { tokensTable } from '../../db/schema/tokens';
import { usersTable } from '../../db/schema/users';
import { errorResponse } from '../../lib/errors';
import { i18n } from '../../lib/i18n';
import { nanoid } from '../../lib/nanoid';
import { logEvent } from '../../middlewares/logger/log-event';
import { CustomHono } from '../../types/common';
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
import { handleCreateUser } from './helpers/user';

const app = new CustomHono();

// * Authentication endpoints
const authRoutes = app
  /*
   * Sign up with email and password
   */
  .openapi(signUpRouteConfig, async (ctx) => {
    const { email, password } = ctx.req.valid('json');

    // * hash password
    const hashedPassword = await new Argon2id().hash(password);
    const userId = nanoid();

    const slug = slugFromEmail(email);

    // * create user and send verification email
    return await handleCreateUser(
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
        isEmailVerified: false,
      },
    );
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

    // * If the user is not found or signed up with oauth
    if (!user || !user.hashedPassword) {
      return errorResponse(ctx, 404, 'not_found', 'warn', 'USER');
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
  });

const allRoutes = authRoutes.route('/', oauthRoutes);

export default allRoutes;

export type AuthRoutes = typeof allRoutes;
