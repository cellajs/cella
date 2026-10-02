import { OpenAPIHono } from '@hono/zod-openapi';
import type { AuthenticationResponseJSON } from '@simplewebauthn/server';
import { appConfig } from 'shared';
import type { Env } from '#/core/context';
import { AppError } from '#/core/error';
import { baseDb } from '#/db/db';
import { mailer } from '#/lib/mailer';
import { issuePasskeyChallenge, verifyPasskeyAssertion } from '#/modules/auth/passkeys/operations/passkey-challenges';
import { findCredentialIdsByUser } from '#/modules/auth/passkeys/passkeys-queries';
import { readStepUp, refuseImpersonation, stampStepUp } from '#/modules/auth/step-up/helpers/step-up';
import { authStepUpRoutes } from '#/modules/auth/step-up/step-up-routes';
import { issueToken, rememberLinkRequest } from '#/modules/auth/tokens/token-lifecycle';
import { tokenLinkUrl } from '#/modules/auth/tokens/token-policies';
import { verifyTotp } from '#/modules/auth/totps/operations/verify-totp';
import { defaultHook } from '#/utils/default-hook';
import { isValidRedirectPath } from '#/utils/is-redirect-url';
import { log } from '#/utils/logger';
import { stepUpEmail } from '../../../../emails';

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

  if (!(await stampStepUp(session.id, user.id, via))) throw new AppError(401, 'session_expired', 'warn');
  log.info('Session stepped up', { via });

  return ctx.body(null, 204);
});

app.openapi(authStepUpRoutes.sendStepUpLink, async (ctx) => {
  const { user, session } = ctx.var;
  refuseImpersonation(session);
  const { redirect } = ctx.req.valid('json');

  // An emailed link stands in for a second factor only while the user holds none.
  const { methods } = await readStepUp(session);
  if (!methods.includes('email')) {
    throw new AppError(400, 'invalid_request', 'warn', { meta: { reason: 'second_factor_held' } });
  }

  const { token, rawToken } = await issueToken(
    { var: { db: baseDb } },
    {
      type: 'step-up',
      userId: user.id,
      email: user.email,
      createdBy: user.id,
      sessionId: session.id,
      redirectPath: isValidRedirectPath(redirect),
    },
  );
  // Opening the link stamps this session only in this browser.
  await rememberLinkRequest(ctx, 'step-up', token.id);

  const stepUpUrl = tokenLinkUrl('step-up', rawToken);
  mailer.prepareEmails(stepUpEmail, { stepUpUrl, name: user.name }, [{ email: user.email, lng: user.language ?? appConfig.defaultLanguage }]);

  if (appConfig.mode === 'development') console.info(`[step-up] ${user.email} ${stepUpUrl}`);
  log.info('Step-up link sent', { tokenId: token.id });

  return ctx.body(null, 204);
});

export const authStepUpHandlers = app;
