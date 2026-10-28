import { z } from '@hono/zod-openapi';
import { createXRoutes, errors, json, jsonBody, xRoute } from '#/core/x-routes';
import { stepUpGuard, userGuard } from '#/middlewares/guard';
import { bulkPointsLimiter, singlePointsLimiter, uploadTokenLimiter } from '#/middlewares/rate-limiter/limiters';
import { mockConnectedApp, mockPaginatedInvitationsResponse } from '#/modules/me/me-mocks';
import {
  connectedAppSchema,
  meAuthDataSchema,
  mePendingInvitationSchema,
  meSchema,
  sessionBaseSchema,
  toggleMfaBodySchema,
  updateMeBodySchema,
  uploadTokenQuerySchema,
  uploadTokenSchema,
} from '#/modules/me/me-schema';
import { membershipBaseSchema } from '#/modules/memberships/memberships-schema';
import { userSchema } from '#/modules/user/user-schema';
import { batchResponseSchema, entityIdParamSchema, entityWithTypeQuerySchema, idsBodySchema, paginationSchema } from '#/schemas';

const meRoutes = createXRoutes(['me', 'cella'], {
  getMe: xRoute({
    method: 'get',
    path: '/',
    xGuard: [userGuard],
    summary: 'Get self',
    description: 'Returns the current user.',
    responses: { 200: json('User', meSchema) },
  }),
  getMyInvitations: xRoute({
    method: 'get',
    path: '/invitations',
    xGuard: [userGuard],
    summary: 'Get list of invitations',
    description: 'Returns a list of pending memberships with entity data.',
    responses: { 200: json('Invitations pending', paginationSchema(mePendingInvitationSchema), mockPaginatedInvitationsResponse()) },
  }),
  updateMe: xRoute({
    method: 'put',
    path: '/',
    xGuard: [userGuard],
    xRateLimiter: [singlePointsLimiter],
    summary: 'Update self',
    description: 'Updates the current user.',
    request: { body: jsonBody(updateMeBodySchema) },
    responses: { 200: json('User', userSchema), ...errors(409) },
  }),
  deleteMe: xRoute({
    method: 'delete',
    path: '/',
    xGuard: [userGuard, stepUpGuard],
    xRateLimiter: [singlePointsLimiter],
    summary: 'Delete self',
    description:
      "Deletes the current user. This also removes the user's memberships (cascade) and sets references to the user to null where applicable.",
    responses: { 204: { description: 'User deleted' }, ...errors(409) },
  }),
  getMyAuth: xRoute({
    method: 'get',
    path: '/auth',
    xGuard: [userGuard],
    summary: 'Get auth data',
    description: 'Returns authentication related data of current user, including sessions, passkeys, TOTP and the enabled sign-in providers.',
    responses: { 200: json('Sign-in methods and sessions', meAuthDataSchema) },
  }),
  revokeMySessions: xRoute({
    method: 'delete',
    path: '/sessions',
    xGuard: [userGuard],
    xRateLimiter: [bulkPointsLimiter],
    summary: 'Revoke sessions',
    description:
      'Revokes sessions of the current user by id. The rows stay for the audit trail and the sessions list shows them as revoked for the retention period. Revoking the current session signs out.',
    request: { body: jsonBody(idsBodySchema()) },
    responses: { 200: json('Sessions were revoked', batchResponseSchema(sessionBaseSchema)), ...errors(403) },
  }),
  deleteMyMembership: xRoute({
    method: 'delete',
    path: '/leave',
    xGuard: [userGuard],
    xRateLimiter: [singlePointsLimiter],
    summary: 'Leave channel',
    description: 'Removes the current user from a channel entity they are a member of.',
    request: { query: entityWithTypeQuerySchema },
    responses: { 204: { description: 'Membership removed' }, ...errors(404, 409) },
  }),
  getUploadToken: xRoute({
    method: 'get',
    path: '/upload-token',
    xGuard: [userGuard],
    xRateLimiter: [uploadTokenLimiter],
    summary: 'Get upload token',
    description:
      'Generates and returns an upload token for uploading files or images, scoped to the current user and organization. The upload template decides the bucket: avatars, covers and newsletter images are public, attachments private. Only a system admin gets a newsletter image token.',
    request: { query: uploadTokenQuerySchema },
    responses: { 200: json('Upload token with a scope for a user or organization', uploadTokenSchema), ...errors(403, 404) },
  }),
  toggleMfa: xRoute({
    method: 'put',
    path: '/mfa',
    xGuard: [userGuard, stepUpGuard],
    xRateLimiter: [singlePointsLimiter],
    summary: 'Toggle MFA',
    description: 'Enable or disable multifactor authentication for the current user. Needs a session stepped up with a passkey or TOTP.',
    request: { body: jsonBody(toggleMfaBodySchema) },
    responses: { 200: json('User', userSchema) },
  }),
  getMyMemberships: xRoute({
    method: 'get',
    path: '/memberships',
    xGuard: [userGuard],
    summary: 'Get my memberships',
    description: 'Returns all memberships for the current user across all channel entities.',
    responses: { 200: json('User memberships', z.object({ items: z.array(membershipBaseSchema) })) },
  }),
  getConnectedApps: xRoute({
    method: 'get',
    path: '/connected-apps',
    xGuard: [userGuard],
    summary: 'Get connected apps',
    description: 'Lists the OAuth clients the user consented to (MCP clients, registered apps) with their scopes.',
    responses: {
      200: json('Connected apps', z.object({ items: z.array(connectedAppSchema) }), { items: [mockConnectedApp()] }),
    },
  }),
  revokeConnectedApp: xRoute({
    method: 'delete',
    path: '/connected-apps/{id}',
    xGuard: [userGuard],
    xRateLimiter: [singlePointsLimiter],
    summary: 'Revoke connected app',
    description: 'Revokes a consent: the grant and every token issued under it are deleted.',
    request: { params: entityIdParamSchema },
    responses: { 200: json('Consent was revoked', batchResponseSchema()), ...errors(404) },
  }),
});

export { meRoutes };
