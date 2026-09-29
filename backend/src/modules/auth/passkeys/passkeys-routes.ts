import { z } from '@hono/zod-openapi';
import { createXRoute } from '#/core/x-routes';
import { publicGuard, stepUpGuard, userGuard } from '#/middlewares/guard';
import { passkeyChallengeLimiter, singlePointsLimiter, tokenLimiter } from '#/middlewares/rate-limiter/limiters';
import { mockPasskeyChallengeResponse, mockPasskeyResponse } from '#/modules/auth/auth-mocks';
import {
  passkeyChallengeBodySchema,
  passkeyChallengeSchema,
  passkeyCreateBodySchema,
  passkeySchema,
  passkeyVerificationBodySchema,
} from '#/modules/auth/passkeys/passkeys-schema';
import { cookieSchema, errorResponseRefs, validIdSchema } from '#/schemas';

const authPasskeysRoutes = {
  generatePasskeyChallenge: createXRoute({
    operationId: 'generatePasskeyChallenge',
    'x-strategy': 'passkey',
    method: 'post',
    path: '/passkey/generate-challenge',
    xGuard: [publicGuard],
    xRateLimiter: [passkeyChallengeLimiter],
    tags: ['auth', 'cella'],
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
        content: { 'application/json': { schema: passkeyChallengeSchema, example: mockPasskeyChallengeResponse() } },
      },
      ...errorResponseRefs,
    },
  }),
  createPasskey: createXRoute({
    operationId: 'createPasskey',
    'x-strategy': 'passkey',
    method: 'post',
    path: '/passkey',
    xGuard: [userGuard, stepUpGuard],
    xRateLimiter: [singlePointsLimiter],
    tags: ['auth', 'cella'],
    summary: 'Create passkey',
    description:
      'Register a passkey for passwordless authentication by verifying a signed challenge and linking it to the current user. Multiple passkeys can be created for different devices/browsers.',
    request: {
      body: {
        required: true,
        content: { 'application/json': { schema: passkeyCreateBodySchema } },
      },
    },
    responses: {
      201: {
        description: 'Passkey created',
        content: { 'application/json': { schema: passkeySchema, example: mockPasskeyResponse() } },
      },
      ...errorResponseRefs,
    },
  }),
  deletePasskey: createXRoute({
    operationId: 'deletePasskey',
    'x-strategy': null,
    method: 'delete',
    path: '/passkey/{id}',
    xGuard: [userGuard, stepUpGuard],
    xRateLimiter: [singlePointsLimiter],
    tags: ['auth', 'cella'],
    summary: 'Delete passkey',
    description: 'Delete a passkey by id from the current user.',
    request: { params: z.object({ id: validIdSchema }) },
    responses: {
      204: {
        description: 'Passkey deleted',
      },
      ...errorResponseRefs,
    },
  }),
  signInWithPasskey: createXRoute({
    operationId: 'signInWithPasskey',
    'x-strategy': 'passkey',
    method: 'post',
    path: '/passkey-verification',
    xGuard: [publicGuard],
    xRateLimiter: [tokenLimiter('passkey')],
    tags: ['auth', 'cella'],
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

export { authPasskeysRoutes };
