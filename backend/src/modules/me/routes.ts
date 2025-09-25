import { z } from '@hono/zod-openapi';
import { createCustomRoute } from '#/lib/custom-routes';
import { isAuthenticated, isPublicAccess } from '#/middlewares/guard';
import { tokenLimiter } from '#/middlewares/rate-limiter/limiters';
import { totpVerificationBodySchema } from '#/modules/auth/schema';
import {
  meAuthDataSchema,
  meInvitationsSchema,
  menuSchema,
  passkeyRegistrationBodySchema,
  passkeySchema,
  toggleMfaStateBody,
  uploadTokenQuerySchema,
  uploadTokenSchema,
} from '#/modules/me/schema';
import { userFlagsSchema, userSchema, userUpdateBodySchema } from '#/modules/users/schema';
import { entityWithTypeQuerySchema, idSchema, locationSchema } from '#/utils/schema/common';
import { errorResponses, successWithoutDataSchema, successWithRejectedItemsSchema } from '#/utils/schema/responses';

const meRoutes = {
  getMe: createCustomRoute({
    operationId: 'getMe',
    method: 'get',
    path: '/',
    guard: isAuthenticated,
    tags: ['me'],
    summary: 'Get self',
    description: 'Returns the *current user*.',
    responses: {
      200: {
        description: 'User',
        content: { 'application/json': { schema: userSchema } },
      },
      ...errorResponses,
    },
  }),

  getMyMenu: createCustomRoute({
    operationId: 'getMyMenu',
    method: 'get',
    path: '/menu',
    guard: isAuthenticated,
    tags: ['me'],
    summary: 'Get menu',
    description:
      'Returns a structured list of context entities the *current user* is a member of, grouped by the entity type and enriched with both `memebrship` and `entity` data.',
    responses: {
      200: {
        description: 'Menu of user',
        content: { 'application/json': { schema: menuSchema } },
      },
      ...errorResponses,
    },
  }),

  getMyInvitations: createCustomRoute({
    operationId: 'getMyInvitations',
    method: 'get',
    path: '/invitations',
    guard: isAuthenticated,
    tags: ['me'],
    summary: 'Get invitations',
    description: 'Returns a list of entities with pending memberships - meaning activatedAt is still null.',
    responses: {
      200: {
        description: 'Entity memberships pending',
        content: { 'application/json': { schema: meInvitationsSchema } },
      },
      ...errorResponses,
    },
  }),

  updateMe: createCustomRoute({
    operationId: 'updateMe',
    method: 'put',
    path: '/',
    guard: isAuthenticated,
    tags: ['me'],
    summary: 'Update self',
    description: 'Updates the *current user*.',
    request: {
      body: {
        content: {
          'application/json': { schema: userUpdateBodySchema.extend({ userFlags: userFlagsSchema.partial().optional() }) },
        },
      },
    },
    responses: {
      200: {
        description: 'User',
        content: { 'application/json': { schema: userSchema } },
      },
      ...errorResponses,
    },
  }),

  deleteMe: createCustomRoute({
    operationId: 'deleteMe',
    method: 'delete',
    path: '/',
    guard: isAuthenticated,
    tags: ['me'],
    summary: 'Delete self',
    description:
      "Deletes the *current user*. This also removes the user's memberships (cascade) and sets references to the user to `null` where applicable.",
    responses: {
      200: {
        description: 'User deleted',
        content: { 'application/json': { schema: successWithoutDataSchema } },
      },
      ...errorResponses,
    },
  }),

  getMyAuth: createCustomRoute({
    operationId: 'getMyAuth',
    method: 'get',
    path: '/auth',
    guard: isAuthenticated,
    tags: ['me'],
    summary: 'Get auth data',
    description: 'Returns authentication related data of *current user*, including sessions, OAuth accounts, and sign in options.',
    responses: {
      200: {
        description: 'User sign-up info',
        content: { 'application/json': { schema: meAuthDataSchema } },
      },
      ...errorResponses,
    },
  }),

  deleteMySessions: createCustomRoute({
    operationId: 'deleteMySessions',
    method: 'delete',
    path: '/sessions',
    guard: isAuthenticated,
    tags: ['me'],
    summary: 'Terminate sessions',
    description: 'Ends one or more sessions for the *current user* based on provided session IDs.',
    request: {
      body: {
        content: { 'application/json': { schema: z.object({ ids: z.array(z.string()).min(1, 'Add at least one item') }) } },
      },
    },

    responses: {
      200: {
        description: 'Success',
        content: { 'application/json': { schema: successWithRejectedItemsSchema } },
      },
      ...errorResponses,
    },
  }),

  deleteMyMembership: createCustomRoute({
    operationId: 'deleteMyMembership',
    method: 'delete',
    path: '/leave',
    guard: isAuthenticated,
    tags: ['me'],
    summary: 'Leave entity',
    description: 'Removes the *current user* from an entity they are a member of.',
    security: [],
    request: {
      query: entityWithTypeQuerySchema,
    },
    responses: {
      200: {
        description: 'Membership removed',
        content: { 'application/json': { schema: successWithoutDataSchema } },
      },
      ...errorResponses,
    },
  }),

  unsubscribeMe: createCustomRoute({
    operationId: 'unsubscribeMe',
    method: 'get',
    path: '/unsubscribe',
    guard: isPublicAccess,
    middleware: [tokenLimiter('unsubscribe')],
    tags: ['me'],
    summary: 'Unsubscribe',
    description:
      'Unsubscribes the user from email notifications using a personal unsubscribe token. No authentication is required, as the token implicitly identifies the *current user*.',
    request: {
      query: z.object({ token: z.string() }),
    },
    responses: {
      302: {
        description: 'Redirect to FE',
        headers: locationSchema,
      },
      ...errorResponses,
    },
  }),

  getUploadToken: createCustomRoute({
    operationId: 'getUploadToken',
    method: 'get',
    path: '/upload-token',
    guard: isAuthenticated,
    tags: ['me'],
    summary: 'Get upload token',
    description:
      'Generates and returns an upload token for uploading files or images to a private S3 bucket, scoped to the *current user* and organization',
    request: { query: uploadTokenQuerySchema },
    responses: {
      200: {
        description: 'Upload token with a scope for a user or organization',
        content: { 'application/json': { schema: uploadTokenSchema } },
      },
      ...errorResponses,
    },
  }),

  toggleMfa: createCustomRoute({
    operationId: 'toggleMfa',
    method: 'put',
    path: '/mfa',
    guard: isAuthenticated,
    tags: ['me'],
    summary: 'Toggle MFA',
    description:
      'Enable or disable multifactor authentication for the *current user*. Requires passkey or TOTP reauthentication if session is older than 1 hour.',
    request: {
      body: { content: { 'application/json': { schema: toggleMfaStateBody } } },
    },
    responses: {
      200: {
        description: 'User',
        content: { 'application/json': { schema: userSchema } },
      },
      ...errorResponses,
    },
  }),

  createPasskey: createCustomRoute({
    operationId: 'createPasskey',
    method: 'post',
    path: '/passkey',
    guard: isAuthenticated,
    tags: ['me'],
    summary: 'Create passkey',
    description:
      'Register a passkey for passwordless authentication by verifying a signed challenge and linking it to the *current user*. Multiple passkeys can be created for different devices/browsers.',
    security: [],
    request: {
      body: {
        required: true,
        content: { 'application/json': { schema: passkeyRegistrationBodySchema } },
      },
    },
    responses: {
      200: {
        description: 'Passkey created',
        content: { 'application/json': { schema: passkeySchema } },
      },
      ...errorResponses,
    },
  }),

  deletePasskey: createCustomRoute({
    operationId: 'deletePasskey',
    method: 'delete',
    path: '/passkey/{id}',
    guard: isAuthenticated,
    tags: ['me'],
    summary: 'Delete passkey',
    description: 'Delete a passkey by id from the *current user*.',
    security: [],
    request: {
      params: z.object({ id: idSchema }),
    },
    responses: {
      200: {
        description: 'Passkey deleted',
        content: { 'application/json': { schema: successWithoutDataSchema } },
      },
      ...errorResponses,
    },
  }),

  registerTotp: createCustomRoute({
    operationId: 'registerTotp',
    method: 'post',
    path: '/totp/register',
    guard: isAuthenticated,
    tags: ['me'],
    summary: 'Register TOTP',
    description: 'Generates a new TOTP secret for the current user and returns a provisioning URI and Base32 manual key.',
    security: [],
    responses: {
      200: {
        description: 'totpUri & manualKey',
        content: { 'application/json': { schema: z.object({ totpUri: z.string(), manualKey: z.string() }) } },
      },
      ...errorResponses,
    },
  }),

  activateTotp: createCustomRoute({
    operationId: 'activateTotp',
    method: 'post',
    path: '/totp/activate',
    guard: isAuthenticated,
    tags: ['me'],
    summary: 'Activate TOTP',
    description:
      'Confirms TOTP setup by verifying a code from the authenticator app for the first time. On success, TOTP is activated for the account.',
    security: [],
    request: {
      body: {
        required: true,
        content: { 'application/json': { schema: totpVerificationBodySchema.pick({ code: true }) } },
      },
    },

    responses: {
      200: {
        description: 'TOTP activated',
        content: { 'application/json': { schema: successWithoutDataSchema } },
      },
      ...errorResponses,
    },
  }),

  deleteTotp: createCustomRoute({
    operationId: 'deleteTotp',
    method: 'delete',
    path: '/totp',
    guard: isAuthenticated,
    tags: ['me'],
    summary: 'Delete TOTP',
    description: 'Delete TOTP credential for current user.',
    security: [],
    responses: {
      200: {
        description: 'TOTP deleted',
        content: { 'application/json': { schema: successWithoutDataSchema } },
      },
      ...errorResponses,
    },
  }),
};
export default meRoutes;
