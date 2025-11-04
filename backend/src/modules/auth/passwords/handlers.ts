import { OpenAPIHono } from '@hono/zod-openapi';
import { appConfig } from 'config';
import { and, eq } from 'drizzle-orm';
import i18n from 'i18next';
import { db } from '#/db/db';
import { emailsTable } from '#/db/schema/emails';
import { passwordsTable } from '#/db/schema/passwords';
import { tokensTable } from '#/db/schema/tokens';
import { usersTable } from '#/db/schema/users';
import { type Env, getContextToken } from '#/lib/context';
import { AppError } from '#/lib/errors';
import { mailer } from '#/lib/mailer';
import { initiateMfa } from '#/modules/auth/general/helpers/mfa';
import { sendVerificationEmail } from '#/modules/auth/general/helpers/send-verification-email';
import { setUserSession } from '#/modules/auth/general/helpers/session';
import { handleCreateUser } from '#/modules/auth/general/helpers/user';
import { hashPassword, verifyPasswordHash } from '#/modules/auth/passwords/helpers/argon2id';
import authPasswordsRoutes from '#/modules/auth/passwords/routes';
import { userSelect } from '#/modules/users/helpers/select';
import { defaultHook } from '#/utils/default-hook';
import { getIsoDate } from '#/utils/iso-date';
import { logEvent } from '#/utils/logger';
import { nanoid } from '#/utils/nanoid';
import { encodeLowerCased } from '#/utils/oslo';
import { slugFromEmail } from '#/utils/slug-from-email';
import { createDate, TimeSpan } from '#/utils/time-span';
import { CreatePasswordEmail, type CreatePasswordEmailProps } from '../../../../emails/create-password';

const enabledStrategies: readonly string[] = appConfig.enabledAuthStrategies;

const app = new OpenAPIHono<Env>({ defaultHook });

const authPasswordsRouteHandlers = app
  /**
   * Sign up with email & password.
   * Attention: sign up is also used for new users that received (system or membership) invitations.
   * Only when invited to a new organization (context), user will proceed to accept this first after signing up.
   */
  .openapi(authPasswordsRoutes.signUp, async (ctx) => {
    const { email, password } = ctx.req.valid('json');

    // Verify if strategy allowed
    const strategy = 'password';
    if (!enabledStrategies.includes(strategy)) {
      throw new AppError({ status: 400, type: 'forbidden_strategy', severity: 'error', meta: { strategy } });
    }

    // Stop if sign up is disabled and no invitation
    if (!appConfig.has.registrationEnabled) throw new AppError({ status: 403, type: 'sign_up_restricted' });
    const slug = slugFromEmail(email);

    // Create user & send verification email
    const newUser = { slug, name: slug, email };

    const user = await handleCreateUser({ newUser });

    // Separatly insert password
    const hashedPassword = await hashPassword(password);
    await db.insert(passwordsTable).values({ userId: user.id, hashedPassword: hashedPassword });

    sendVerificationEmail({ userId: user.id });

    return ctx.body(null, 201);
  })
  /**
   * Sign up with email & password to accept (system or membership) invitations.
   * Token is in single use session cookie.
   * Only for organization membership invitations, user will proceed to accept after signing up.
   */
  .openapi(authPasswordsRoutes.signUpWithToken, async (ctx) => {
    const { password } = ctx.req.valid('json');

    const validToken = getContextToken();
    if (!validToken) throw new AppError({ status: 400, type: 'invalid_request', severity: 'error' });

    // Verify if strategy allowed
    const strategy = 'password';
    if (!enabledStrategies.includes(strategy)) {
      throw new AppError({ status: 400, type: 'forbidden_strategy', severity: 'error', meta: { strategy } });
    }

    // add token if it's membership invitation
    const inactiveMembershipId = validToken.inactiveMembershipId || null;
    const slug = slugFromEmail(validToken.email);

    // Create user
    const newUser = { slug, name: slug, email: validToken.email };
    const user = await handleCreateUser({ newUser, inactiveMembershipId, emailVerified: true });

    // Separately insert password
    const hashedPassword = await hashPassword(password);
    await db.insert(passwordsTable).values({ userId: user.id, hashedPassword: hashedPassword });

    // Sign in user
    await setUserSession(ctx, user, strategy);

    const membershipInvite = !!(validToken.type === 'invitation' && validToken.inactiveMembershipId);

    return ctx.json({ membershipInvite }, 201);
  })
  /**
   * Request reset password email
   */
  .openapi(authPasswordsRoutes.requestPassword, async (ctx) => {
    const { email } = ctx.req.valid('json');

    const normalizedEmail = email.toLowerCase().trim();

    const [user] = await db
      .select(userSelect)
      .from(usersTable)
      .leftJoin(emailsTable, eq(usersTable.id, emailsTable.userId))
      .where(eq(emailsTable.email, normalizedEmail))
      .limit(1);
    if (!user) throw new AppError({ status: 404, type: 'invalid_email', severity: 'warn', entityType: 'user' });

    // Delete old token if exists
    await db.delete(tokensTable).where(and(eq(tokensTable.userId, user.id), eq(tokensTable.type, 'password-reset')));

    // Generate token and store hashed
    const newToken = nanoid(40);
    const hashedToken = encodeLowerCased(newToken);

    const [tokenRecord] = await db
      .insert(tokensTable)
      .values({
        token: hashedToken,
        type: 'password-reset',
        userId: user.id,
        email,
        createdBy: user.id,
        expiresAt: createDate(new TimeSpan(2, 'h')),
      })
      .returning();

    // Send email
    const lng = user.language;
    const createPasswordLink = `${appConfig.backendAuthUrl}/invoke-token/${tokenRecord.type}/${newToken}`;
    const subject = i18n.t('backend:email.create_password.subject', { lng, appName: appConfig.name });
    const staticProps = { createPasswordLink, subject, lng };
    const recipients = [{ email: user.email }];

    type Recipient = { email: string };

    mailer.prepareEmails<CreatePasswordEmailProps, Recipient>(CreatePasswordEmail, staticProps, recipients);

    logEvent('info', 'Create password link sent', { userId: user.id });

    return ctx.body(null, 204);
  })
  /**
   * Create password with single use session token in cookie
   */
  .openapi(authPasswordsRoutes.createPasswordWithToken, async (ctx) => {
    const { password } = ctx.req.valid('json');
    const token = getContextToken();

    // Verify if strategy allowed
    const strategy = 'password';
    if (!enabledStrategies.includes(strategy)) {
      throw new AppError({ status: 400, type: 'forbidden_strategy', severity: 'error', meta: { strategy } });
    }

    // If the token is not found or expired
    if (!token || !token.userId) throw new AppError({ status: 401, type: 'invalid_token', severity: 'warn' });

    const [user] = await db.select(userSelect).from(usersTable).where(eq(usersTable.id, token.userId)).limit(1);

    // If the user is not found
    if (!user) {
      throw new AppError({ status: 404, type: 'not_found', severity: 'warn', entityType: 'user', meta: { userId: token.userId } });
    }

    // Hash password
    const hashedPassword = await hashPassword(password);

    // update user password and set email verified
    await Promise.all([
      db.insert(passwordsTable).values({ userId: user.id, hashedPassword }).onConflictDoUpdate({
        target: passwordsTable.userId,
        set: { hashedPassword },
      }),
      db.update(emailsTable).set({ verified: true, verifiedAt: getIsoDate() }).where(eq(emailsTable.email, user.email)),
    ]);

    const mfaRedirectPath = await initiateMfa(ctx, user);
    if (mfaRedirectPath) {
      // Append fromRoot to avoid redirecting to FE homepage
      const redirectPath = `${mfaRedirectPath}?fromRoot=true`;
      return ctx.json({ shouldRedirect: true, redirectPath }, 201);
    }

    await setUserSession(ctx, user, strategy);
    return ctx.json({ shouldRedirect: false }, 201);
  })
  /**
   * Sign in with email and password
   * Attention: sign in is also used as a preparation to accept organization invitations (when signed out & user exists),
   * after signing in, we proceed to accept the invitation.
   */
  .openapi(authPasswordsRoutes.signIn, async (ctx) => {
    const { email, password } = ctx.req.valid('json');

    // Verify if strategy allowed
    const strategy = 'password';
    if (!enabledStrategies.includes(strategy)) {
      throw new AppError({ status: 400, type: 'forbidden_strategy', severity: 'error', meta: { strategy } });
    }

    const normalizedEmail = email.toLowerCase().trim();

    const [info] = await db
      .select({ user: usersTable, hashedPassword: passwordsTable.hashedPassword, emailVerified: emailsTable.verified })
      .from(usersTable)
      .innerJoin(emailsTable, eq(usersTable.id, emailsTable.userId))
      .leftJoin(passwordsTable, eq(usersTable.id, passwordsTable.userId))
      .where(eq(emailsTable.email, normalizedEmail))
      .limit(1);

    // If user is not found or doesn't have password
    if (!info) throw new AppError({ status: 404, type: 'not_found', severity: 'warn', entityType: 'user' });

    const { user, hashedPassword, emailVerified } = info;

    if (!hashedPassword) throw new AppError({ status: 403, type: 'no_password_found', severity: 'warn' });
    // Verify password
    const validPassword = await verifyPasswordHash(hashedPassword, password);
    if (!validPassword) throw new AppError({ status: 403, type: 'invalid_password', severity: 'warn' });

    // If email is not verified, send verification email
    if (!emailVerified) {
      sendVerificationEmail({ userId: user.id });
      return ctx.json({ shouldRedirect: true, redirectPath: '/auth/email-verification/signin' }, 200);
    }

    const redirectPath = await initiateMfa(ctx, user);
    if (redirectPath) return ctx.json({ shouldRedirect: true, redirectPath }, 200);

    await setUserSession(ctx, user, 'password');
    return ctx.json({ shouldRedirect: false }, 200);
  });
export default authPasswordsRouteHandlers;
