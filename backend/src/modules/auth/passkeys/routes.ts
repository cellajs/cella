import { z } from '@hono/zod-openapi';
import { createXRoute } from '#/docs/x-routes';
import { isAuthenticated, isPublicAccess } from '#/middlewares/guard';
import { passkeyChallengeLimiter, tokenLimiter } from '#/middlewares/rate-limiter/limiters';
import {
  passkeyChallengeBodySchema,
  passkeyChallengeSchema,
  passkeyCreateBodySchema,
  passkeySchema,
  passkeyVerificationBodySchema,
} from '#/modules/auth/passkeys/schema';
import { cookieSchema, idSchema } from '#/utils/schema/common';
import { errorResponseRefs } from '#/utils/schema/error-responses';

const authPasskeysRoutes = {
  /**
   * Generate passkey challenge
   */
  generatePasskeyChallenge: createXRoute({
    operationId: 'generatePasskeyChallenge',
    method: 'post',
    path: '/passkey/generate-challenge',
    xGuard: isPublicAccess,
    xRateLimiter: passkeyChallengeLimiter,
    tags: ['auth'],
    summary: 'Generate passkey challenge',
    description: 'Initiates the passkey registration or authentication flow by generating a device bound challenge.',
    request: {
      body: {
        required: true,
        content: { 'application/json': { schema: passkeyChallengeBodySchema } },
      },
    },
    responses: {
      200: {
        description: 'Challenge generated',
        content: { 'application/json': { schema: passkeyChallengeSchema } },
      },
      ...errorResponseRefs,
    },
  }),
  /**
   * Create passkey
   */
  createPasskey: createXRoute({
    operationId: 'createPasskey',
    method: 'post',
    path: '/passkey',
    xGuard: isAuthenticated,
    tags: ['auth'],
    summary: 'Create passkey',
    description:
      'Register a passkey for passwordless authentication by verifying a signed challenge and linking it to the *current user*. Multiple passkeys can be created for different devices/browsers.',
    request: {
      body: {
        required: true,
        content: { 'application/json': { schema: passkeyCreateBodySchema } },
      },
    },
    responses: {
      201: {
        description: 'Passkey created',
        content: { 'application/json': { schema: passkeySchema } },
      },
      ...errorResponseRefs,
    },
  }),
  /**
   * Delete passkey
   */
  deletePasskey: createXRoute({
    operationId: 'deletePasskey',
    method: 'delete',
    path: '/passkey/{id}',
    xGuard: isAuthenticated,
    tags: ['auth'],
    summary: 'Delete passkey',
    description: 'Delete a passkey by id from the *current user*.',
    request: { params: z.object({ id: idSchema }) },
    responses: {
      204: {
        description: 'Passkey deleted',
      },
      ...errorResponseRefs,
    },
  }),
  /**
   * Verify passkey
   */
  signInWithPasskey: createXRoute({
    operationId: 'signInWithPasskey',
    method: 'post',
    path: '/passkey-verification',
    xGuard: isPublicAccess,
    xRateLimiter: tokenLimiter('passkey'),
    tags: ['auth'],
    summary: 'Verify passkey',
    description: 'Validates the signed challenge and completes passkey based authentication.',
    request: {
      body: {
        required: true,
        content: { 'application/json': { schema: passkeyVerificationBodySchema } },
      },
    },
    responses: {
      204: {
        description: 'Passkey verified',
        headers: z.object({ 'Set-Cookie': cookieSchema }),
      },
      ...errorResponseRefs,
    },
  }),
};

export default authPasskeysRoutes;
