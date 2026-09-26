import { createXRoute } from '#/core/x-routes';
import { userGuard } from '#/middlewares/guard';
import { passkeyChallengeLimiter, spamLimiter, stepUpLimiter } from '#/middlewares/rate-limiter/limiters';
import { passkeyChallengeSchema } from '#/modules/auth/passkeys/passkeys-schema';
import { stepUpBodySchema, stepUpLinkBodySchema, stepUpStateSchema } from '#/modules/auth/step-up/step-up-schema';
import { errorResponseRefs } from '#/schemas';

const authStepUpRoutes = {
  getStepUp: createXRoute({
    operationId: 'getStepUp',
    method: 'get',
    path: '/step-up',
    xGuard: [userGuard],
    tags: ['auth', 'cella'],
    summary: 'Get step-up state',
    description:
      'Whether this session stands stepped up for account-security actions, and what the user can offer to step up: a passkey or TOTP they hold, else an emailed confirmation link or a new sign-in.',
    responses: {
      200: {
        description: 'Step-up state',
        content: { 'application/json': { schema: stepUpStateSchema } },
      },
      ...errorResponseRefs,
    },
  }),
  getStepUpPasskeyChallenge: createXRoute({
    operationId: 'getStepUpPasskeyChallenge',
    'x-strategy': 'passkey',
    method: 'post',
    path: '/step-up/passkey-challenge',
    xGuard: [userGuard],
    xRateLimiter: [passkeyChallengeLimiter],
    tags: ['auth', 'cella'],
    summary: 'Get a step-up passkey challenge',
    description:
      "Issues a passkey challenge for a step-up of this session, bound to the current user, with the user's passkeys to offer. Only a step-up answers it. Refused while impersonating.",
    responses: {
      200: {
        description: 'Challenge issued',
        content: { 'application/json': { schema: passkeyChallengeSchema } },
      },
      ...errorResponseRefs,
    },
  }),
  stepUp: createXRoute({
    operationId: 'stepUp',
    method: 'post',
    path: '/step-up',
    xGuard: [userGuard],
    xRateLimiter: [stepUpLimiter],
    tags: ['auth', 'cella'],
    summary: 'Step up with a second factor',
    description:
      'Proves the user is present on this session with a passkey assertion (to a step-up passkey challenge) or a TOTP code of a factor they hold. Account-security actions then pass for ten minutes. Refused while impersonating.',
    request: {
      body: { required: true, content: { 'application/json': { schema: stepUpBodySchema } } },
    },
    responses: {
      204: { description: 'Session stepped up' },
      ...errorResponseRefs,
    },
  }),
  sendStepUpLink: createXRoute({
    operationId: 'sendStepUpLink',
    method: 'post',
    path: '/step-up/link',
    xGuard: [userGuard],
    xRateLimiter: [spamLimiter],
    tags: ['auth', 'cella'],
    summary: 'Email a step-up link',
    description:
      'For a user without a passkey or TOTP: emails a confirmation link that steps up this session when opened in this browser within ten minutes. The link signs nobody in. Refused while impersonating.',
    request: {
      body: { content: { 'application/json': { schema: stepUpLinkBodySchema } } },
    },
    responses: {
      204: { description: 'Link sent' },
      ...errorResponseRefs,
    },
  }),
};

export { authStepUpRoutes };
