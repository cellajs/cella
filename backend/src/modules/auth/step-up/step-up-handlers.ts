import { OpenAPIHono } from '@hono/zod-openapi';
import type { AuthenticationResponseJSON } from '@simplewebauthn/server';
import type { Env } from '#/core/context';
import { AppError } from '#/core/error';
import { issuePasskeyChallenge, verifyPasskeyAssertion } from '#/modules/auth/passkeys/operations/passkey-challenges';
import { findCredentialIdsByUser } from '#/modules/auth/passkeys/passkeys-queries';
import { updateSessionSteppedUp } from '#/modules/auth/sessions/sessions-queries';
import { refuseImpersonation } from '#/modules/auth/step-up/helpers/step-up';
import { readStepUp } from '#/modules/auth/step-up/operations/read-step-up';
import { sendStepUpLinkOp } from '#/modules/auth/step-up/operations/send-step-up-link';
import { authStepUpRoutes } from '#/modules/auth/step-up/step-up-routes';
import { verifyTotp } from '#/modules/auth/totps/operations/verify-totp';
import { defaultHook } from '#/utils/default-hook';
import { log } from '#/utils/logger';

const app = new OpenAPIHono<Env>({ defaultHook });

app.openapi(authStepUpRoutes.getStepUp, async (ctx) => {
  const { steppedUp, methods } = await readStepUp(ctx.var.session);
  return ctx.json({ steppedUp, methods }, 200);
});

app.openapi(authStepUpRoutes.getStepUpPasskeyChallenge, async (ctx) => {
  const { user, session } = ctx.var;
  refuseImpersonation(session);

  // Issued for this account and for a step-up only: a sign-in or MFA challenge never answers as a step-up proof.
  const challenge = await issuePasskeyChallenge(ctx, { purpose: 'step-up', userId: user.id });
  const credentials = await findCredentialIdsByUser(ctx, { userId: user.id });

  return ctx.json({ challenge, credentialIds: credentials.map((c) => c.credentialId) }, 200);
});

app.openapi(authStepUpRoutes.stepUp, async (ctx) => {
  const { user, session } = ctx.var;
  refuseImpersonation(session);
  const { passkeyData, totpCode } = ctx.req.valid('json');

  const via = passkeyData ? 'passkey' : totpCode ? 'totp' : null;
  const { methods } = await readStepUp(session);
  if (!via || !methods.some((method) => method === via)) {
    throw new AppError(400, 'invalid_request', 'warn', { meta: { reason: 'second_factor_required' } });
  }

  if (passkeyData) {
    const assertion = passkeyData as AuthenticationResponseJSON;
    await verifyPasskeyAssertion(ctx, { assertion, purpose: 'step-up', userId: user.id });
  }
  if (totpCode) await verifyTotp(ctx, { user, code: totpCode });

  if (!(await updateSessionSteppedUp(ctx, { id: session.id, userId: user.id, via }))) throw new AppError(401, 'session_expired', 'warn');
  log.info('Session stepped up', { via });

  return ctx.body(null, 204);
});

app.openapi(authStepUpRoutes.sendStepUpLink, async (ctx) => {
  const { redirect } = ctx.req.valid('json');
  await sendStepUpLinkOp(ctx, { redirect });
  return ctx.body(null, 204);
});

export const authStepUpHandlers = app;
