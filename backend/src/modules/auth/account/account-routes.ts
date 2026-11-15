import { createXRoutes, json, jsonBody, xRoute } from '#/core/x-routes';
import { stepUpGuard, userGuard } from '#/middlewares/guard';
import { bulkPointsLimiter, singlePointsLimiter } from '#/middlewares/rate-limiter/limiters';
import { meAuthDataSchema, sessionBaseSchema, toggleMfaBodySchema } from '#/modules/auth/account/account-schema';
import { userSchema } from '#/modules/user/user-schema';
import { batchResponseSchema, idsBodySchema } from '#/schemas';

/** The account-security surface: how the signed-in user signs in, their sessions, and the MFA switch. */
export const authAccountRoutes = createXRoutes(['auth', 'cella'], {
  getMyAuth: xRoute({
    method: 'get',
    path: '/me',
    xGuard: [userGuard],
    xAnonymous: true,
    summary: 'Get auth data',
    description: 'Returns authentication related data of current user, including sessions, passkeys, TOTP and the enabled sign-in providers.',
    responses: { 200: json('Sign-in methods and sessions', meAuthDataSchema) },
  }),
  revokeMySessions: xRoute({
    method: 'post',
    path: '/sessions/~revoke',
    xGuard: [userGuard],
    xRateLimiter: [bulkPointsLimiter],
    summary: 'Revoke sessions',
    description:
      'Revokes sessions of the current user by id. The rows stay for the audit trail and the sessions list shows them as revoked for the retention period. Revoking the current session signs out; revoking any other needs a recent proof of presence on this session (step-up).',
    request: { body: jsonBody(idsBodySchema()) },
    responses: { 200: json('Sessions were revoked', batchResponseSchema(sessionBaseSchema)) },
  }),
  toggleMfa: xRoute({
    method: 'post',
    path: '/~toggle-mfa',
    xGuard: [userGuard, stepUpGuard],
    xRateLimiter: [singlePointsLimiter],
    summary: 'Toggle MFA',
    description: 'Enable or disable multifactor authentication for the current user. Needs a session stepped up with a passkey or TOTP.',
    request: { body: jsonBody(toggleMfaBodySchema) },
    responses: { 200: json('User', userSchema) },
  }),
});
