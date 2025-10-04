import { z } from '@hono/zod-openapi';
import { createCustomRoute } from '#/lib/custom-routes';
import { isAuthenticated, isPublicAccess } from '#/middlewares/guard';
import { spamLimiter, tokenLimiter } from '#/middlewares/rate-limiter/limiters';
import {
  passkeyChallengeBodySchema,
  passkeyChallengeSchema,
  passkeyCreateBodySchema,
  passkeySchema,
  passkeyVerificationBodySchema,
} from '#/modules/auth/passkeys/schema';
import { cookieSchema, idSchema } from '#/utils/schema/common';
import { errorResponses } from '#/utils/schema/responses';

const authPasskeysRoutes = {
  generatePasskeyChallenge: createCustomRoute({
    operationId: 'generatePasskeyChallenge',
    method: 'post',
    path: '/passkey/generate-challenge',
    guard: isPublicAccess,
    // TODO look into rate limit customized for passkeys
    middleware: [spamLimiter],
    tags: ['auth'],
    summary: 'Generate passkey challenge',
    description: 'Initiates the passkey registration or authentication flow by generating a device bound challenge.',
    security: [],
    request: { body: { content: { 'application/json': { schema: passkeyChallengeBodySchema } } } },
    responses: {
      200: {
        description: 'Challenge generated',
        content: { 'application/json': { schema: passkeyChallengeSchema } },
      },
      ...errorResponses,
    },
  }),

  createPasskey: createCustomRoute({
    operationId: 'createPasskey',
    method: 'post',
    path: '/passkey',
    guard: isAuthenticated,
    tags: ['auth'],
    summary: 'Create passkey',
    description:
      'Register a passkey for passwordless authentication by verifying a signed challenge and linking it to the *current user*. Multiple passkeys can be created for different devices/browsers.',
    security: [],
    request: {
      body: {
        required: true,
        content: { 'application/json': { schema: passkeyCreateBodySchema } },
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
    tags: ['auth'],
    summary: 'Delete passkey',
    description: 'Delete a passkey by id from the *current user*.',
    security: [],
    request: {
      params: z.object({ id: idSchema }),
    },
    responses: {
      204: {
        description: 'Passkey deleted',
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
      204: {
        description: 'Passkey verified',
        headers: z.object({ 'Set-Cookie': cookieSchema }),
      },
      ...errorResponses,
    },
  }),
};

export default authPasskeysRoutes;
