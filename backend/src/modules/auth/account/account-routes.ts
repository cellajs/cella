import { createXRoutes, errors, json, jsonBody, xRoute } from '#/core/x-routes';
import { stepUpFactorGuard, stepUpGuard, sysAdminGuard, userGuard } from '#/middlewares/guard';
import { bulkPointsLimiter, singlePointsLimiter } from '#/middlewares/rate-limiter/limiters';
import {
  factorRemovedSchema,
  meAuthDataSchema,
  recoverableFactorParamSchema,
  sessionsRevokedSchema,
  toggleMfaBodySchema,
} from '#/modules/auth/account/account-schema';
import { sessionBaseSchema } from '#/modules/auth/core/sessions/sessions-schema';
import { userSchema } from '#/modules/user/user-schema';
import { batchResponseSchema, idsBodySchema, userIdParamSchema } from '#/schemas';

/** The account-security surface: how the signed-in user signs in, their sessions, the MFA switch, and an administrator's recovery of another account. */
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
  revokeUserSessions: xRoute({
    method: 'delete',
    path: '/users/{userId}/sessions',
    xGuard: [userGuard, sysAdminGuard, stepUpFactorGuard],
    xRateLimiter: [singlePointsLimiter],
    summary: 'Sign a user out everywhere',
    description:
      'Ends every session of the user and every app they consented to, for a person locked out or whose account is compromised. The rows stay revoked for their sessions list, every stream bound to them closes, and the person is mailed. For system administrators with a second factor proven on this session; not for their own account, nor for another system administrator.',
    request: { params: userIdParamSchema },
    responses: { 200: json('Sessions ended', sessionsRevokedSchema), ...errors(404) },
  }),
  removeUserFactor: xRoute({
    method: 'delete',
    path: '/users/{userId}/factors/{factor}',
    xGuard: [userGuard, sysAdminGuard, stepUpFactorGuard],
    xRateLimiter: [singlePointsLimiter],
    summary: "Remove a user's lost factor",
    description:
      'Removes every passkey, or the authenticator app, of the user, for a person who lost them. When MFA is on and a required method is now gone, MFA turns off. The person is mailed about the removal, and about MFA when it turned off. For system administrators with a second factor proven on this session; not for their own account, nor for another system administrator.',
    request: { params: recoverableFactorParamSchema },
    responses: { 200: json('Factor removed', factorRemovedSchema), ...errors(404) },
  }),
});
