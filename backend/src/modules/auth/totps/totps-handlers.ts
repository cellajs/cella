import { getRandomValues } from 'node:crypto';
import { OpenAPIHono } from '@hono/zod-openapi';
import { appConfig } from 'shared';
import type { Env } from '#/core/context';
import { AppError } from '#/core/error';
import { deleteAuthCookie, getAuthCookie, setAuthCookie } from '#/modules/auth/general/helpers/cookie';
import { sendAccountSecurityEmail } from '#/modules/auth/general/helpers/send-account-security-email';
import { mfaFactorRules } from '#/modules/auth/mfa/operations/factor-rules';
import { completeMfaChallenge } from '#/modules/auth/mfa/operations/mfa-challenge';
import { updateSessionSteppedUp } from '#/modules/auth/sessions/sessions-queries';
import { createTOTPKeyURI } from '#/modules/auth/totps/helpers/totp-core';
import { verifyTotp } from '#/modules/auth/totps/operations/verify-totp';
import { deleteTotp, findTotp, insertTotp } from '#/modules/auth/totps/totps-queries';
import { authTotpsRoutes } from '#/modules/auth/totps/totps-routes';
import { encodeBase32 } from '#/utils/base32';
import { defaultHook } from '#/utils/default-hook';
import { TimeSpan } from '#/utils/time-span';

/** How long a TOTP setup waits for its first code: the pending secret's cookie lives that long. */
const totpSetupLifetime = new TimeSpan(5, 'm');

const app = new OpenAPIHono<Env>({ defaultHook });

app.openapi(authTotpsRoutes.generateTotpKey, async (ctx) => {
  const user = ctx.var.user;

  if (await findTotp(ctx, { userId: user.id })) throw new AppError(409, 'resource_already_exists', 'warn');

  // 160 bits, the shared secret length RFC 4226 recommends.
  const secretBytes = getRandomValues(new Uint8Array(20));

  const manualKey = encodeBase32(secretBytes);

  setAuthCookie(ctx, 'totp-challenge', manualKey, totpSetupLifetime);

  const totpUri = createTOTPKeyURI(appConfig.slug, user.email, secretBytes, appConfig.totp.intervalInSeconds, appConfig.totp.digits);

  return ctx.json({ totpUri, manualKey }, 200);
});

app.openapi(authTotpsRoutes.createTotp, async (ctx) => {
  const user = ctx.var.user;

  const { code } = ctx.req.valid('json');

  if (await findTotp(ctx, { userId: user.id })) throw new AppError(409, 'resource_already_exists', 'warn');

  const pendingSecret = getAuthCookie(ctx, 'totp-challenge');
  if (!pendingSecret) throw new AppError(400, 'invalid_credentials', 'warn');

  // The confirming code's step is stored with the secret, so the same code cannot also answer a second factor.
  const lastUsedStep = await verifyTotp(ctx, { user, code, pendingSecret });
  await insertTotp(ctx, { userId: user.id, secret: pendingSecret, lastUsedStep });

  // Clean up the challenge cookie to prevent reuse
  deleteAuthCookie(ctx, 'totp-challenge');

  // The confirming code proved the new authenticator on this session, which steps the session up with it.
  await updateSessionSteppedUp(ctx, { id: ctx.var.session.id, userId: user.id, via: 'totp' });
  sendAccountSecurityEmail(user, 'totp-added');

  return ctx.body(null, 201);
});

app.openapi(authTotpsRoutes.deleteTotp, async (ctx) => {
  const user = ctx.var.user;

  // The delete rolls back when MFA is on: it keeps the authenticator app until MFA is turned off.
  const deleted = await mfaFactorRules.removeFactor(user.id, (txCtx) => deleteTotp(txCtx, { userId: user.id }));

  // Without an authenticator app the answer is 204 as well, but only a deletion mails the user.
  if (deleted) sendAccountSecurityEmail(user, 'totp-deleted');

  return ctx.body(null, 204);
});

app.openapi(authTotpsRoutes.signInWithTotp, async (ctx) => {
  const { code } = ctx.req.valid('json');

  await completeMfaChallenge(ctx, { strategy: 'totp', code });

  return ctx.body(null, 204);
});

export const authTotpsHandlers = app;
