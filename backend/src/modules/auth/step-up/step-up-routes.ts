import { createXRoutes, errors, json, jsonBody, xRoute } from '#/core/x-routes';
import { userGuard } from '#/middlewares/guard';
import { passkeyChallengeLimiter, spamLimiter, stepUpLimiter } from '#/middlewares/rate-limiter/limiters';
import { passkeyChallengeSchema } from '#/modules/auth/passkeys/passkeys-schema';
import { stepUpBodySchema, stepUpQuerySchema, stepUpStateSchema } from '#/modules/auth/step-up/step-up-schema';

const authStepUpRoutes = createXRoutes(['auth', 'cella'], {
  getStepUp: xRoute({
    method: 'get',
    path: '/step-up',
    xGuard: [userGuard],
    summary: 'Get step-up state',
    description:
      'Whether this session stands stepped up for a kind of action, and what the user can offer to step up: a passkey or TOTP they hold, an emailed code, or setting up a second factor.',
    request: { query: stepUpQuerySchema },
    responses: { 200: json('Step-up state', stepUpStateSchema) },
  }),
  getStepUpPasskeyChallenge: xRoute({
    method: 'post',
    path: '/step-up/passkey-challenge',
    xEnabledBy: { strategy: 'passkey' },
    xGuard: [userGuard],
    xRateLimiter: [passkeyChallengeLimiter],
    summary: 'Get a step-up passkey challenge',
    description:
      "Issues a passkey challenge for a step-up of this session, bound to the current user, with the user's passkeys to offer. Only a step-up answers it.",
    responses: { 200: json('Challenge issued', passkeyChallengeSchema), ...errors(403) },
  }),
  stepUp: xRoute({
    method: 'post',
    path: '/step-up',
    xGuard: [userGuard],
    xRateLimiter: [stepUpLimiter],
    summary: 'Step up',
    description:
      'Proves the user is present on this session with a passkey assertion (to a step-up passkey challenge), a TOTP code of a factor they hold, or the code a step-up mail carried. The proof counts for ten minutes.',
    request: { body: jsonBody(stepUpBodySchema) },
    responses: { 204: { description: 'Session stepped up' }, ...errors(403, 404) },
  }),
  sendStepUpCode: xRoute({
    method: 'post',
    path: '/step-up/code',
    xGuard: [userGuard],
    xRateLimiter: [spamLimiter],
    summary: 'Email a step-up code',
    description:
      'For a user without a passkey or TOTP, or one replacing a lost factor while MFA is off: emails a code that steps up this session when entered within ten minutes.',
    responses: { 204: { description: 'Code sent' }, ...errors(403, 409) },
  }),
});

export { authStepUpRoutes };
