import { OpenAPIHono } from '@hono/zod-openapi';
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from '@simplewebauthn/server';
import { and, eq } from 'drizzle-orm';
import type { Env } from '#/core/context';
import { AppError } from '#/core/error';
import { baseDb } from '#/db/db';
import { findCredentialIdsByUser, insertPasskey } from '#/modules/auth/auth-queries';
import { deviceInfo } from '#/modules/auth/general/helpers/device-info';
import { mfaFactorRules, spendConfirmMfaToken, validateConfirmMfaToken } from '#/modules/auth/general/helpers/mfa';
import { sendAccountSecurityEmail } from '#/modules/auth/general/helpers/send-account-security-email';
import { setUserSession } from '#/modules/auth/general/helpers/session';
import {
  issuePasskeyChallenge,
  verifyPasskeyAssertion,
  verifyPasskeyRegistration,
} from '#/modules/auth/passkeys/helpers/passkey';
import { passkeysTable } from '#/modules/auth/passkeys/passkeys-db';
import { authPasskeysRoutes } from '#/modules/auth/passkeys/passkeys-routes';
import { spendCookieToken } from '#/modules/auth/tokens/token-lifecycle';
import { findUserById } from '#/modules/user/user-queries';
import { defaultHook } from '#/utils/default-hook';

const app = new OpenAPIHono<Env>({ defaultHook });

app.openapi(authPasskeysRoutes.createPasskey, async (ctx) => {
  const user = ctx.var.user;

  const { attestation, nameOnDevice } = ctx.req.valid('json');

  const { credentialId, publicKey, counter } = await verifyPasskeyRegistration(
    ctx,
    attestation as RegistrationResponseJSON,
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

  // A credential id names one account: an authenticator presenting one that is registered already is refused.
  const newPasskey = await insertPasskey(ctx, { values: passkeyValue });
  if (!newPasskey) throw new AppError(409, 'resource_already_exists', 'warn');

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
  const { type } = ctx.req.valid('json');

  // The second factor of an MFA challenge is the one case with a known account, so its passkeys may be offered. A
  // sign-in challenge names none: the passkey the browser picks names its account.
  const user = type === 'mfa' ? await validateConfirmMfaToken(ctx) : null;

  const challenge = await issuePasskeyChallenge(ctx, { purpose: type, userId: user?.id });

  const credentials = user ? await findCredentialIdsByUser(ctx, { userId: user.id }) : [];
  const credentialIds = credentials.map((c) => c.credentialId);

  return ctx.json({ challenge, credentialIds }, 200);
});

app.openapi(authPasskeysRoutes.signInWithPasskey, async (ctx) => {
  const { type, assertion } = ctx.req.valid('json');
  const response = assertion as AuthenticationResponseJSON;

  if (type === 'mfa') {
    const user = await validateConfirmMfaToken(ctx);
    await verifyPasskeyAssertion(ctx, { assertion: response, purpose: 'mfa', userId: user.id });
    await spendConfirmMfaToken(ctx);
    await setUserSession(ctx, user, 'passkey', 'mfa');
    return ctx.body(null, 204);
  }

  const userId = await verifyPasskeyAssertion(ctx, { assertion: response, purpose: 'authentication' });
  const user = await findUserById(ctx, { id: userId });
  if (!user) throw new AppError(404, 'not_found', 'warn', { entityType: 'user' });

  // A regular passkey sign-in also ends a challenge this browser left open.
  await spendCookieToken(ctx, 'confirm-mfa');

  await setUserSession(ctx, user, 'passkey', 'regular');

  return ctx.body(null, 204);
});

export const authPasskeysHandlers = app;
