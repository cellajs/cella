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
import { getAuthCookie, setAuthCookie } from '#/modules/auth/general/helpers/cookie';
import { consumeMfaToken, validateConfirmMfaToken } from '#/modules/auth/general/helpers/mfa';
import { setUserSession } from '#/modules/auth/general/helpers/session';
import { signInWithTotp } from '#/modules/auth/totps/helpers/totps';
import { defaultHook } from '#/utils/default-hook';
import { TimeSpan } from '#/utils/time-span';
import authTotpRoutes from './routes';
import authTotpsRoutes from './routes';

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
    await setAuthCookie(ctx, 'totp_key', manualKey, new TimeSpan(5, 'm'));

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
    const encodedSecret = await getAuthCookie(ctx, 'totp_key');
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

    return ctx.json(true, 200);
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

    return ctx.json(true, 200);
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

    // Get totp credentials
    const [credentials] = await db.select().from(totpsTable).where(eq(totpsTable.userId, user.id)).limit(1);
    if (!credentials) throw new AppError({ status: 404, type: 'not_found', severity: 'warn', meta });

    try {
      // Verify TOTP code using stored secret
      const isValid = signInWithTotp(code, credentials.secret);
      if (!isValid) throw new AppError({ status: 401, type: 'invalid_token', severity: 'warn', meta });
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

    // Consume the MFA token now that TOTP verification succeeded
    await consumeMfaToken(ctx);

    // Set user session after successful verification
    await setUserSession(ctx, user, meta.strategy, meta.sessionType);

    return ctx.json(true, 200);
  });

export default authTotpsRouteHandlers;
