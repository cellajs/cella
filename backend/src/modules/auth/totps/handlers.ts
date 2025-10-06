import { OpenAPIHono } from '@hono/zod-openapi';
import { encodeBase32UpperCase } from '@oslojs/encoding';
import { createTOTPKeyURI } from '@oslojs/otp';
import { appConfig } from 'config';
import { eq } from 'drizzle-orm';
import { db } from '#/db/db';
import { passkeysTable } from '#/db/schema/passkeys';
import { totpsTable } from '#/db/schema/totps';
import { usersTable } from '#/db/schema/users';
import { type Env, getContextUser } from '#/lib/context';
import { AppError } from '#/lib/errors';
import { deleteAuthCookie, getAuthCookie, setAuthCookie } from '#/modules/auth/general/helpers/cookie';
import { validateConfirmMfaToken } from '#/modules/auth/general/helpers/mfa';
import { setUserSession } from '#/modules/auth/general/helpers/session';
import { signInWithTotp, validateTOTP } from '#/modules/auth/totps/helpers/totps';
import { default as authTotpRoutes, default as authTotpsRoutes } from '#/modules/auth/totps/routes';
import { defaultHook } from '#/utils/default-hook';
import { TimeSpan } from '#/utils/time-span';

const enabledStrategies: readonly string[] = appConfig.enabledAuthStrategies;

const app = new OpenAPIHono<Env>({ defaultHook });

const authTotpsRouteHandlers = app
  /**
   * Create TOTP key
   */
  .openapi(authTotpsRoutes.generateTotpKey, async (ctx) => {
    const user = getContextUser();

    // Generate a 20-byte random secret and encode it as Base32
    const secretBytes = crypto.getRandomValues(new Uint8Array(20));

    // Base32 → for authenticator app (manual entry or QR code)
    const manualKey = encodeBase32UpperCase(secretBytes);

    // Save the secret in a short-lived cookie (5 minutes)
    await setAuthCookie(ctx, 'totp-challenge', manualKey, new TimeSpan(5, 'm'));

    // otpauth:// URI for QR scanner apps
    const totpUri = createTOTPKeyURI(appConfig.slug, user.email, secretBytes, appConfig.totpConfig.intervalInSeconds, appConfig.totpConfig.digits);

    return ctx.json({ totpUri, manualKey }, 200);
  })
  /**
   * Create TOTP in database
   */
  .openapi(authTotpsRoutes.createTotp, async (ctx) => {
    const { code } = ctx.req.valid('json');
    const user = getContextUser();

    // Retrieve the encoded totp secret from cookie
    const encodedSecret = await getAuthCookie(ctx, 'totp-challenge');
    if (!encodedSecret) throw new AppError({ status: 400, type: 'invalid_credentials', severity: 'warn' });

    // Verify TOTP code
    try {
      const isValid = signInWithTotp(code, encodedSecret);
      if (!isValid) throw new AppError({ status: 403, type: 'invalid_token', severity: 'warn' });
    } catch (error) {
      if (error instanceof AppError) throw error;

      throw new AppError({
        status: 500,
        type: 'invalid_credentials',
        severity: 'error',
        ...(error instanceof Error ? { originalError: error } : {}),
      });
    }

    // Save encoded secret key in database
    await db.insert(totpsTable).values({ userId: user.id, secret: encodedSecret });

    return ctx.body(null, 204);
  })
  /**
   * Unlink TOTP
   */
  .openapi(authTotpsRoutes.deleteTotp, async (ctx) => {
    const user = getContextUser();

    // Remove all totps linked to this user's email
    await db.delete(totpsTable).where(eq(totpsTable.userId, user.id));

    // Check if the user still has any passkeys or TOTP entries registered
    const [userPasskeys, userTotps] = await Promise.all([
      db.select().from(passkeysTable).where(eq(passkeysTable.userId, user.id)),
      db.select().from(totpsTable).where(eq(totpsTable.userId, user.id)),
    ]);

    // If no TOTP and Passkeys exists, disable MFA completely
    if (!userPasskeys.length || !userTotps.length) {
      await db.update(usersTable).set({ mfaRequired: false }).where(eq(usersTable.id, user.id));
    }

    return ctx.body(null, 204);
  })
  /**
   * Verify TOTP
   */
  .openapi(authTotpRoutes.signInWithTotp, async (ctx) => {
    const { code } = ctx.req.valid('json');

    const strategy = 'totp';

    // Verify if strategy allowed
    if (!enabledStrategies.includes(strategy)) {
      throw new AppError({ status: 400, type: 'forbidden_strategy', severity: 'error', meta: { strategy } });
    }

    // Define strategy and session type for metadata/logging purposes
    const meta = { strategy, sessionType: 'mfa' } as const;

    // Validate MFA token and retrieve user
    const user = await validateConfirmMfaToken(ctx);

    try {
      await validateTOTP({ code, userId: user.id });
    } catch (error) {
      if (error instanceof AppError) throw error;

      throw new AppError({
        status: 500,
        type: 'totp_verification_failed',
        severity: 'error',
        meta,
        ...(error instanceof Error ? { originalError: error } : {}),
      });
    }

    // Revoke single use token by deleting cookie
    deleteAuthCookie(ctx, 'confirm-mfa');

    // Set user session after successful verification
    await setUserSession(ctx, user, meta.strategy, meta.sessionType);

    return ctx.body(null, 204);
  });

export default authTotpsRouteHandlers;
