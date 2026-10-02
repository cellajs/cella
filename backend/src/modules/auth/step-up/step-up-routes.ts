import { createXRoutes, json, jsonBody, xRoute } from '#/core/x-routes';
import { strategyEnabled, userGuard } from '#/middlewares/guard';
import { passkeyChallengeLimiter, spamLimiter, stepUpLimiter } from '#/middlewares/rate-limiter/limiters';
import { passkeyChallengeSchema } from '#/modules/auth/passkeys/passkeys-schema';
import { stepUpBodySchema, stepUpLinkBodySchema, stepUpStateSchema } from '#/modules/auth/step-up/step-up-schema';

const authStepUpRoutes = createXRoutes(['auth', 'cella'], {
  getStepUp: xRoute({
    method: 'get',
    path: '/step-up',
    xGuard: [userGuard],
    summary: 'Get step-up state',
    description:
      'Whether this session stands stepped up for account-security actions, and what the user can offer to step up: a passkey or TOTP they hold, else an emailed confirmation link or a new sign-in.',
    responses: { 200: json('Step-up state', stepUpStateSchema) },
  }),
  getStepUpPasskeyChallenge: xRoute({
    method: 'post',
    path: '/step-up/passkey-challenge',
    xGuard: [strategyEnabled('passkey'), userGuard],
    xRateLimiter: [passkeyChallengeLimiter],
    summary: 'Get a step-up passkey challenge',
    description:
      "Issues a passkey challenge for a step-up of this session, bound to the current user, with the user's passkeys to offer. Only a step-up answers it.",
    responses: { 200: json('Challenge issued', passkeyChallengeSchema) },
  }),
  stepUp: xRoute({
    method: 'post',
    path: '/step-up',
    xGuard: [userGuard],
    xRateLimiter: [stepUpLimiter],
    summary: 'Step up with a second factor',
    description:
      'Proves the user is present on this session with a passkey assertion (to a step-up passkey challenge) or a TOTP code of a factor they hold. Account-security actions then pass for ten minutes.',
    request: { body: jsonBody(stepUpBodySchema) },
    responses: { 204: { description: 'Session stepped up' } },
  }),
  sendStepUpLink: xRoute({
    method: 'post',
    path: '/step-up/link',
    xGuard: [userGuard],
    xRateLimiter: [spamLimiter],
    summary: 'Email a step-up link',
    description:
      'For a user without a passkey or TOTP: emails a confirmation link that steps up this session when opened in this browser within ten minutes. The link signs nobody in.',
    request: { body: { content: { 'application/json': { schema: stepUpLinkBodySchema } } } },
    responses: { 204: { description: 'Link sent' } },
  }),
});

export { authStepUpRoutes };
