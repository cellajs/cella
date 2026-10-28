import { OpenAPIHono } from '@hono/zod-openapi';
import type { Env } from '#/core/context';
import { AppError } from '#/core/error';
import { issuePasskeyChallenge, verifyPasskeyAssertion } from '#/modules/auth/passkeys/operations/passkey-challenges';
import { updateSessionSteppedUp } from '#/modules/auth/sessions/sessions-queries';
import { refuseImpersonation } from '#/modules/auth/step-up/helpers/step-up';
import { readStepUp } from '#/modules/auth/step-up/operations/read-step-up';
import { sendStepUpCodeOp } from '#/modules/auth/step-up/operations/send-step-up-code';
import { authStepUpRoutes } from '#/modules/auth/step-up/step-up-routes';
import { spendCodeToken } from '#/modules/auth/tokens/token-lifecycle';
import { verifyTotp } from '#/modules/auth/totps/operations/verify-totp';
import { defaultHook } from '#/utils/default-hook';
import { log } from '#/utils/logger';

const app = new OpenAPIHono<Env>({ defaultHook });

app.openapi(authStepUpRoutes.getStepUp, async (ctx) => {
  const { tier } = ctx.req.valid('query');
  const { steppedUp, methods } = await readStepUp(ctx.var.session, tier);
  return ctx.json({ steppedUp, methods }, 200);
});

app.openapi(authStepUpRoutes.getStepUpPasskeyChallenge, async (ctx) => {
  const { user, session } = ctx.var;
  refuseImpersonation(session);

  // Issued for this account and for a step-up only: a sign-in or MFA challenge never answers as a step-up proof.
  return ctx.json(await issuePasskeyChallenge(ctx, { purpose: 'step-up', userId: user.id }), 200);
});

app.openapi(authStepUpRoutes.stepUp, async (ctx) => {
  const { user, session } = ctx.var;
  refuseImpersonation(session);
  const { passkeyData, totpCode, emailCode } = ctx.req.valid('json');

  const via = passkeyData ? 'passkey' : totpCode ? 'totp' : emailCode ? 'email' : null;
  // The `enroll` methods are every proof this endpoint takes: the factors held, and the mail where it is offered.
  const { methods } = await readStepUp(session, 'enroll');
  if (!via || !methods.includes(via)) {
    throw new AppError(400, 'invalid_request', 'warn', { meta: { reason: 'proof_not_offered' } });
  }

  if (passkeyData) await verifyPasskeyAssertion(ctx, { assertion: passkeyData, purpose: 'step-up', userId: user.id });
  if (totpCode) await verifyTotp(ctx, { user, code: totpCode });
  if (emailCode && !(await spendCodeToken({ type: 'step-up', sessionId: session.id, code: emailCode }))) {
    throw new AppError(401, 'invalid_credentials', 'warn');
  }

  if (!(await updateSessionSteppedUp(ctx, { id: session.id, userId: user.id, via }))) throw new AppError(401, 'session_expired', 'warn');
  log.info('Session stepped up', { via });

  return ctx.body(null, 204);
});

app.openapi(authStepUpRoutes.sendStepUpCode, async (ctx) => {
  await sendStepUpCodeOp(ctx);
  return ctx.body(null, 204);
});

export const authStepUpHandlers = app;
