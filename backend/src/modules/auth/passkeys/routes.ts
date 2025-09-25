import { z } from '@hono/zod-openapi';
import { createCustomRoute } from '#/lib/custom-routes';
import { isAuthenticated, isPublicAccess } from '#/middlewares/guard';
import { spamLimiter, tokenLimiter } from '#/middlewares/rate-limiter/limiters';
import { passkeyChallengeBodySchema, passkeyChallengeSchema, passkeyVerificationBodySchema } from './schema';
import { cookieSchema, idSchema } from '#/utils/schema/common';
import { errorResponses, successWithoutDataSchema } from '#/utils/schema/responses';
import { passkeyRegistrationBodySchema, passkeySchema } from './schema';

const authPasskeysRoutes = {
  createPasskeyChallenge: createCustomRoute({
    operationId: 'createPasskeyChallenge',
    method: 'post',
    path: '/passkey-challenge',
    guard: isPublicAccess,
    // TODO look into rate limit customized for passkeys
    middleware: [spamLimiter],
    tags: ['auth'],
    summary: 'Create passkey challenge',
    description: 'Initiates the passkey registration or authentication flow by creating a device bound challenge.',
    security: [],
    request: { body: { content: { 'application/json': { schema: passkeyChallengeBodySchema } } } },
    responses: {
      200: {
        description: 'Challenge created',
        content: { 'application/json': { schema: passkeyChallengeSchema } },
      },
      ...errorResponses,
    },
  }),

  // TODO confusing in relation to totp, what is register,create, activate?
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

  signInWithPasskey: createCustomRoute({
    operationId: 'signInWithPasskey',
    method: 'post',
    path: '/passkey-verification',
    guard: isPublicAccess,
    middleware: [tokenLimiter('passkey')],
    tags: ['auth'],
    summary: 'Verify passkey',
    description: 'Validates the signed challenge and completes passkey based authentication.',
    request: {
      body: { content: { 'application/json': { schema: passkeyVerificationBodySchema } } },
    },
    responses: {
      200: {
        description: 'Passkey verified',
        headers: z.object({ 'Set-Cookie': cookieSchema }),
        content: { 'application/json': { schema: successWithoutDataSchema } },
      },
      ...errorResponses,
    },
  }),
};

export default authPasskeysRoutes;
