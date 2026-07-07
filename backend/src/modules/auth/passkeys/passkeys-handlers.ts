import { getRandomValues } from 'node:crypto';
import { OpenAPIHono } from '@hono/zod-openapi';
import { encodeBase64 } from '@oslojs/encoding';
import { and, eq } from 'drizzle-orm';
import { appConfig } from 'shared';
import type { Env } from '#/core/context';
import { AppError } from '#/core/error';
import { baseDb } from '#/db/db';
import {
  disableMfa,
  findAuthUserById,
  findCredentialIdsByUser,
  findRemainingMfaMethods,
  findUserByCredentialId,
  findUserByEmail,
  insertPasskey,
} from '#/modules/auth/auth-queries';
import { deleteAuthCookie, getAuthCookie, setAuthCookie } from '#/modules/auth/general/helpers/cookie';
import { deviceInfo } from '#/modules/auth/general/helpers/device-info';
import { validateConfirmMfaToken } from '#/modules/auth/general/helpers/mfa';
import { sendAccountSecurityEmail } from '#/modules/auth/general/helpers/send-account-security-email';
import { setUserSession } from '#/modules/auth/general/helpers/session';
import { parseAndValidatePasskeyAttestation, validatePasskey } from '#/modules/auth/passkeys/helpers/passkey';
import { passkeysTable } from '#/modules/auth/passkeys/passkeys-db';
import { authPasskeysRoutes } from '#/modules/auth/passkeys/passkeys-routes';
import type { UserModel } from '#/modules/user/user-db';
import { defaultHook } from '#/utils/default-hook';
import { TimeSpan } from '#/utils/time-span';

const app = new OpenAPIHono<Env>({ defaultHook });

app.openapi(authPasskeysRoutes.createPasskey, async (ctx) => {
  const user = ctx.var.user;

  const { attestationObject, clientDataJSON, nameOnDevice } = ctx.req.valid('json');

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

  // Save public key in database
  const newPasskey = await insertPasskey(ctx, { values: passkeyValue });

  sendAccountSecurityEmail(user, 'passkey-added');

  return ctx.json(newPasskey, 201);
});

app.openapi(authPasskeysRoutes.deletePasskey, async (ctx) => {
  const user = ctx.var.user;

  const { id } = ctx.req.valid('param');

  // Remove passkey and conditionally disable MFA atomically
  await baseDb.transaction(async (tx) => {
    await tx.delete(passkeysTable).where(and(eq(passkeysTable.userId, user.id), eq(passkeysTable.id, id)));

    // Check if the user still has any passkeys or TOTP entries registered
    const { passkeys, totps } = await findRemainingMfaMethods({ var: { ...ctx.var, db: tx } }, { userId: user.id });

    // MFA requires both passkeys and TOTP as backup — disable if either is missing
    if (!passkeys.length || !totps.length) {
      await disableMfa({ var: { ...ctx.var, db: tx } }, { userId: user.id });
    }
  });

  sendAccountSecurityEmail(user, 'passkey-removed');

  return ctx.body(null, 204);
});

app.openapi(authPasskeysRoutes.generatePasskeyChallenge, async (ctx) => {
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
    user = await findUserByEmail(ctx, { email: normalizedEmail });
  }
  // If this is a multifactor request, retrieve user from pending MFA token
  if (type === 'mfa') {
    const userFromToken = await validateConfirmMfaToken(ctx);
    user = userFromToken;
  }

  // If we still have no email, return challenge with empty credential list
  if (!user) return ctx.json({ challengeBase64, credentialIds: [] }, 200);

  // Fetch all passkey credentials for this user
  const credentials = await findCredentialIdsByUser(ctx, { userId: user.id });

  const credentialIds = credentials.map((c) => c.credentialId);

  return ctx.json({ challengeBase64, credentialIds }, 200);
});

app.openapi(authPasskeysRoutes.signInWithPasskey, async (ctx) => {
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
    user = await findUserByEmail(ctx, { email: normalizedEmail });
  }

  // Override user if this is a multifactor authentication
  if (type === 'mfa') {
    const userFromToken = await validateConfirmMfaToken(ctx);
    user = userFromToken;
  }

  // If no user found by email, try to find by credentialId (supports conditional mediation / discoverable credentials)
  if (!user) {
    const passkeyRecord = await findUserByCredentialId(ctx, { credentialId: passkeyData.credentialId });

    if (passkeyRecord) {
      user = await findAuthUserById(ctx, { userId: passkeyRecord.userId });
    }
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

export const authPasskeysHandlers = app;
