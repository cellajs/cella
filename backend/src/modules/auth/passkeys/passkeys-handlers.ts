import { getRandomValues } from 'node:crypto';
import { OpenAPIHono } from '@hono/zod-openapi';
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from '@simplewebauthn/server';
import { and, eq } from 'drizzle-orm';
import type { Env } from '#/core/context';
import { AppError } from '#/core/error';
import { baseDb } from '#/db/db';
import { findCredentialIdsByUser, findUserIdByCredentialId, insertPasskey } from '#/modules/auth/auth-queries';
import { deleteAuthCookie, getAuthCookie, setAuthCookie } from '#/modules/auth/general/helpers/cookie';
import { deviceInfo } from '#/modules/auth/general/helpers/device-info';
import { mfaFactorRules, spendConfirmMfaToken, validateConfirmMfaToken } from '#/modules/auth/general/helpers/mfa';
import { sendAccountSecurityEmail } from '#/modules/auth/general/helpers/send-account-security-email';
import { setUserSession } from '#/modules/auth/general/helpers/session';
import { validatePasskey, verifyPasskeyRegistration } from '#/modules/auth/passkeys/helpers/passkey';
import { passkeysTable } from '#/modules/auth/passkeys/passkeys-db';
import { authPasskeysRoutes } from '#/modules/auth/passkeys/passkeys-routes';
import { spendCookieToken } from '#/modules/auth/tokens/token-lifecycle';
import type { UserModel } from '#/modules/user/user-db';
import { findUserByEmail, findUserById } from '#/modules/user/user-queries';
import { defaultHook } from '#/utils/default-hook';
import { TimeSpan } from '#/utils/time-span';

const app = new OpenAPIHono<Env>({ defaultHook });

app.openapi(authPasskeysRoutes.createPasskey, async (ctx) => {
  const user = ctx.var.user;

  const { attestation, nameOnDevice } = ctx.req.valid('json');

  const challengeFromCookie = await getAuthCookie(ctx, 'passkey-challenge');
  deleteAuthCookie(ctx, 'passkey-challenge');

  if (!challengeFromCookie) throw new AppError(401, 'invalid_credentials', 'error');

  const { credentialId, publicKey, counter } = await verifyPasskeyRegistration(
    attestation as RegistrationResponseJSON,
    challengeFromCookie,
  );

  const device = deviceInfo(ctx);
  const passkeyValue = {
    userId: user.id,
    credentialId,
    publicKey,
    counter,
    nameOnDevice,
    deviceName: device.name,
    deviceType: device.type,
    deviceOs: device.os,
    browser: device.browser,
  };

  const newPasskey = await insertPasskey(ctx, { values: passkeyValue });

  sendAccountSecurityEmail(user, 'passkey-added');

  return ctx.json(newPasskey, 201);
});

app.openapi(authPasskeysRoutes.deletePasskey, async (ctx) => {
  const user = ctx.var.user;

  const { id } = ctx.req.valid('param');

  // The delete rolls back when MFA is on and this was the last passkey: it stays until MFA is turned off.
  await baseDb.transaction(async (tx) => {
    await tx.delete(passkeysTable).where(and(eq(passkeysTable.userId, user.id), eq(passkeysTable.id, id)));
    await mfaFactorRules.assertKeepsFactors(tx, user.id);
  });

  sendAccountSecurityEmail(user, 'passkey-deleted');

  return ctx.body(null, 204);
});

app.openapi(authPasskeysRoutes.generatePasskeyChallenge, async (ctx) => {
  const { email, type } = ctx.req.valid('json');

  // Generate a 32-byte random challenge and encode it as base64url (the WebAuthn JSON encoding)
  const challenge = Buffer.from(getRandomValues(new Uint8Array(32))).toString('base64url');

  await setAuthCookie(ctx, 'passkey-challenge', challenge, new TimeSpan(5, 'm'));

  let user: UserModel | null = null;

  if (email && type === 'authentication') {
    const normalizedEmail = email.toLowerCase().trim();
    user = await findUserByEmail(ctx, { email: normalizedEmail });
  }
  if (type === 'mfa') {
    const userFromToken = await validateConfirmMfaToken(ctx);
    user = userFromToken;
  }

  if (!user) return ctx.json({ challenge, credentialIds: [] }, 200);

  const credentials = await findCredentialIdsByUser(ctx, { userId: user.id });

  const credentialIds = credentials.map((c) => c.credentialId);

  return ctx.json({ challenge, credentialIds }, 200);
});

app.openapi(authPasskeysRoutes.signInWithPasskey, async (ctx) => {
  const { email, type, assertion } = ctx.req.valid('json');
  const meta = { strategy: 'passkey', sessionType: type === 'mfa' ? 'mfa' : 'regular' } as const;

  let user: UserModel | null = null;

  if (email) {
    const normalizedEmail = email.toLowerCase().trim();
    user = await findUserByEmail(ctx, { email: normalizedEmail });
  }

  if (type === 'mfa') {
    const userFromToken = await validateConfirmMfaToken(ctx);
    user = userFromToken;
  }

  // If no user found by email, try to find by credentialId (supports conditional mediation / discoverable credentials)
  if (!user) {
    const passkeyRecord = await findUserIdByCredentialId(ctx, { credentialId: assertion.id });

    if (passkeyRecord) {
      user = await findUserById(ctx, { id: passkeyRecord.userId });
    }
  }

  if (!user) throw new AppError(404, 'not_found', 'warn', { entityType: 'user', meta });

  try {
    await validatePasskey(ctx, { assertion: assertion as AuthenticationResponseJSON, userId: user.id });
  } catch (error) {
    if (error instanceof AppError) throw error;

    throw new AppError(500, 'passkey_verification_failed', 'error', {
      meta,
      ...(error instanceof Error ? { originalError: error } : {}),
    });
  }

  // A regular passkey sign-in also ends a challenge this browser left open.
  if (type === 'mfa') await spendConfirmMfaToken(ctx);
  else await spendCookieToken(ctx, 'confirm-mfa');

  await setUserSession(ctx, user, meta.strategy, meta.sessionType);

  return ctx.body(null, 204);
});

export const authPasskeysHandlers = app;
