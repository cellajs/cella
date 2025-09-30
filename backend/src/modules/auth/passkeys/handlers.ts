import { getRandomValues } from 'node:crypto';
import { OpenAPIHono } from '@hono/zod-openapi';
import { encodeBase64 } from '@oslojs/encoding';
import { appConfig } from 'config';
import { and, eq, getTableColumns } from 'drizzle-orm';
import { db } from '#/db/db';
import { emailsTable } from '#/db/schema/emails';
import { passkeysTable } from '#/db/schema/passkeys';
import { totpsTable } from '#/db/schema/totps';
import { type UserModel, usersTable } from '#/db/schema/users';
import { type Env, getContextUser } from '#/lib/context';
import { AppError } from '#/lib/errors';
import { getAuthCookie, setAuthCookie } from '#/modules/auth/general/helpers/cookie';
import { deviceInfo } from '#/modules/auth/general/helpers/device-info';
import { consumeMfaToken, validateConfirmMfaToken } from '#/modules/auth/general/helpers/mfa';
import { setUserSession } from '#/modules/auth/general/helpers/session';
import { parseAndValidatePasskeyAttestation, validatePasskey } from '#/modules/auth/passkeys/helpers/passkey';
import { usersBaseQuery } from '#/modules/users/helpers/select';
import { defaultHook } from '#/utils/default-hook';
import { TimeSpan } from '#/utils/time-span';
import authPasskeysRoutes from './routes';

const enabledStrategies: readonly string[] = appConfig.enabledAuthStrategies;

const app = new OpenAPIHono<Env>({ defaultHook });

const authPasskeysRouteHandlers = app
  /**
   * Register passkey
   */
  .openapi(authPasskeysRoutes.createPasskey, async (ctx) => {
    const { attestationObject, clientDataJSON, nameOnDevice } = ctx.req.valid('json');
    const user = getContextUser();

    const challengeFromCookie = await getAuthCookie(ctx, 'passkey-challenge');
    if (!challengeFromCookie) throw new AppError({ status: 401, type: 'invalid_credentials', severity: 'error' });

    const { credentialId, publicKey } = parseAndValidatePasskeyAttestation(clientDataJSON, attestationObject, challengeFromCookie);

    const device = deviceInfo(ctx);
    const passkeyValue = {
      userId: user.id,
      credentialId,
      publicKey,
      nameOnDevice,
      deviceName: device.name,
      deviceType: device.type,
      deviceOs: device.os,
      browser: device.browser,
    };

    const { credentialId: _, publicKey: __, ...passkeySelect } = getTableColumns(passkeysTable);

    // Save public key in database
    const [newPasskey] = await db.insert(passkeysTable).values(passkeyValue).returning(passkeySelect);

    return ctx.json(newPasskey, 200);
  })
  /**
   * Delete passkey
   */
  .openapi(authPasskeysRoutes.deletePasskey, async (ctx) => {
    const { id } = ctx.req.valid('param');
    const user = getContextUser();

    // Remove all passkeys linked to this user's email
    await db.delete(passkeysTable).where(and(eq(passkeysTable.userId, user.id), eq(passkeysTable.id, id)));

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
   * Passkey challenge
   */
  .openapi(authPasskeysRoutes.generatePasskeyChallenge, async (ctx) => {
    const { email, type } = ctx.req.valid('json');

    // Generate a 32-byte random challenge and encode it as Base64
    const challenge = getRandomValues(new Uint8Array(32));
    const challengeBase64 = encodeBase64(challenge);

    // Save the challenge in a short-lived cookie (5 minutes)
    await setAuthCookie(ctx, 'passkey-challenge', challengeBase64, new TimeSpan(5, 'm'));

    let user: UserModel | null = null;

    // Find user by email if provided
    if (email && type === 'authentication') {
      const normalizedEmail = email.toLowerCase().trim();

      const [tableUser] = await usersBaseQuery()
        .leftJoin(emailsTable, eq(usersTable.id, emailsTable.userId))
        .where(eq(emailsTable.email, normalizedEmail))
        .limit(1);

      user = tableUser;
    }
    // If this is a multifactor request, retrieve user from pending MFA token
    if (type === 'mfa') {
      const userFromToken = await validateConfirmMfaToken(ctx);
      user = userFromToken;
    }

    // If we still have no email, return challenge with empty credential list
    if (!user) return ctx.json({ challengeBase64, credentialIds: [] }, 200);

    // Fetch all passkey credentials for this user
    const credentials = await db.select({ credentialId: passkeysTable.credentialId }).from(passkeysTable).where(eq(passkeysTable.userId, user.id));

    const credentialIds = credentials.map((c) => c.credentialId);

    return ctx.json({ challengeBase64, credentialIds }, 200);
  })
  /**
   * Signin using passkey
   */
  .openapi(authPasskeysRoutes.signInWithPasskey, async (ctx) => {
    const { email, type, ...passkeyData } = ctx.req.valid('json');
    // Define strategy and session type for metadata/logging purposes
    const meta = { strategy: 'passkey', sessionType: type === 'mfa' ? 'mfa' : 'regular' } as const;

    if (type === 'authentication' && !enabledStrategies.includes(meta.strategy)) {
      throw new AppError({ status: 400, type: 'forbidden_strategy', severity: 'error', meta });
    }

    let user: UserModel | null = null;

    // Find user by email if provided
    if (email) {
      const normalizedEmail = email.toLowerCase().trim();

      const [tableUser] = await usersBaseQuery()
        .leftJoin(emailsTable, eq(usersTable.id, emailsTable.userId))
        .where(eq(emailsTable.email, normalizedEmail))
        .limit(1);

      user = tableUser;
    }

    // Override user if this is a multifactor authentication
    if (type === 'mfa') {
      const userFromToken = await validateConfirmMfaToken(ctx);
      user = userFromToken;
    }

    // Fail early if user not found
    if (!user) throw new AppError({ status: 404, type: 'not_found', severity: 'warn', entityType: 'user', meta });

    try {
      await validatePasskey(ctx, { ...passkeyData, userId: user.id });
    } catch (error) {
      if (error instanceof AppError) throw error;

      throw new AppError({
        status: 500,
        type: 'passkey_verification_failed',
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

export default authPasskeysRouteHandlers;
