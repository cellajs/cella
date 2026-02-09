import { getRandomValues } from 'node:crypto';
import { OpenAPIHono } from '@hono/zod-openapi';
import { encodeBase64 } from '@oslojs/encoding';
import { and, eq, getColumns } from 'drizzle-orm';
import { appConfig } from 'shared';
import { unsafeInternalDb as db } from '#/db/db';
import { emailsTable } from '#/db/schema/emails';
import { passkeysTable } from '#/db/schema/passkeys';
import { totpsTable } from '#/db/schema/totps';
import { type UserModel, usersTable } from '#/db/schema/users';
import { type Env } from '#/lib/context';
import { AppError } from '#/lib/error';
import { deleteAuthCookie, getAuthCookie, setAuthCookie } from '#/modules/auth/general/helpers/cookie';
import { deviceInfo } from '#/modules/auth/general/helpers/device-info';
import { validateConfirmMfaToken } from '#/modules/auth/general/helpers/mfa';
import { setUserSession } from '#/modules/auth/general/helpers/session';
import { parseAndValidatePasskeyAttestation, validatePasskey } from '#/modules/auth/passkeys/helpers/passkey';
import authPasskeysRoutes from '#/modules/auth/passkeys/passkeys-routes';
import { userSelect } from '#/modules/user/helpers/select';
import { defaultHook } from '#/utils/default-hook';
import { TimeSpan } from '#/utils/time-span';

const app = new OpenAPIHono<Env>({ defaultHook });

const authPasskeysRouteHandlers = app
  /**
   * Register passkey
   */
  .openapi(authPasskeysRoutes.createPasskey, async (ctx) => {
    const { attestationObject, clientDataJSON, nameOnDevice } = ctx.req.valid('json');
    const user = ctx.var.user;

    const challengeFromCookie = await getAuthCookie(ctx, 'passkey-challenge');
    deleteAuthCookie(ctx, 'passkey-challenge');

    if (!challengeFromCookie) throw new AppError(401, 'invalid_credentials', 'error');

    const { credentialId, publicKey } = parseAndValidatePasskeyAttestation(
      clientDataJSON,
      attestationObject,
      challengeFromCookie,
    );

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

    const { credentialId: _, publicKey: __, ...passkeySelect } = getColumns(passkeysTable);

    // Save public key in database
    const [newPasskey] = await db.insert(passkeysTable).values(passkeyValue).returning(passkeySelect);

    return ctx.json(newPasskey, 201);
  })
  /**
   * Delete passkey
   */
  .openapi(authPasskeysRoutes.deletePasskey, async (ctx) => {
    const { id } = ctx.req.valid('param');
    const user = ctx.var.user;

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

    return ctx.body(null, 204);
  })
  /**
   * Passkey challenge
   */
  .openapi(authPasskeysRoutes.generatePasskeyChallenge, async (ctx) => {
    const { email, type } = ctx.req.valid('json');

    const strategy = 'passkey';
    if (!appConfig.enabledAuthStrategies.includes(strategy)) {
      throw new AppError(400, 'forbidden_strategy', 'error', { meta: { strategy } });
    }

    // Generate a 32-byte random challenge and encode it as Base64
    const challenge = getRandomValues(new Uint8Array(32));
    const challengeBase64 = encodeBase64(challenge);

    // Save the challenge in a short-lived cookie (5 minutes)
    await setAuthCookie(ctx, 'passkey-challenge', challengeBase64, new TimeSpan(5, 'm'));

    let user: UserModel | null = null;

    // Find user by email if provided
    if (email && type === 'authentication') {
      const normalizedEmail = email.toLowerCase().trim();

      const [tableUser] = await db
        .select(userSelect)
        .from(usersTable)
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
    const credentials = await db
      .select({ credentialId: passkeysTable.credentialId })
      .from(passkeysTable)
      .where(eq(passkeysTable.userId, user.id));

    const credentialIds = credentials.map((c) => c.credentialId);

    return ctx.json({ challengeBase64, credentialIds }, 200);
  })
  /**
   * Sign in using passkey
   */
  .openapi(authPasskeysRoutes.signInWithPasskey, async (ctx) => {
    const { email, type, ...passkeyData } = ctx.req.valid('json');
    // Define strategy and session type for metadata/logging purposes
    const meta = { strategy: 'passkey', sessionType: type === 'mfa' ? 'mfa' : 'regular' } as const;

    if (type === 'authentication' && !appConfig.enabledAuthStrategies.includes(meta.strategy)) {
      throw new AppError(400, 'forbidden_strategy', 'error', { meta });
    }

    let user: UserModel | null = null;

    // Find user by email if provided
    if (email) {
      const normalizedEmail = email.toLowerCase().trim();

      const [tableUser] = await db
        .select(userSelect)
        .from(usersTable)
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
    if (!user) throw new AppError(404, 'not_found', 'warn', { entityType: 'user', meta });

    try {
      await validatePasskey(ctx, { ...passkeyData, userId: user.id });
    } catch (error) {
      if (error instanceof AppError) throw error;

      throw new AppError(500, 'passkey_verification_failed', 'error', {
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

export default authPasskeysRouteHandlers;
