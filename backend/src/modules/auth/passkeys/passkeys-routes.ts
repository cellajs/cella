import { z } from '@hono/zod-openapi';
import { createXRoutes, json, jsonBody, xRoute } from '#/core/x-routes';
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
import { cookieSchema, validIdSchema } from '#/schemas';

const authPasskeysRoutes = createXRoutes(['auth', 'cella'], {
  generatePasskeyChallenge: xRoute({
    'x-strategy': 'passkey',
    method: 'post',
    path: '/passkey/generate-challenge',
    xGuard: [publicGuard],
    xRateLimiter: [passkeyChallengeLimiter],
    summary: 'Generate passkey challenge',
    description: 'Initiates the passkey registration or authentication flow by generating a device bound challenge.',
    request: { body: jsonBody(passkeyChallengeBodySchema) },
    responses: { 200: json('Challenge generated', passkeyChallengeSchema, mockPasskeyChallengeResponse()) },
  }),
  createPasskey: xRoute({
    'x-strategy': 'passkey',
    method: 'post',
    path: '/passkey',
    xGuard: [userGuard, stepUpGuard],
    xRateLimiter: [singlePointsLimiter],
    summary: 'Create passkey',
    description:
      'Register a passkey for passwordless authentication by verifying a signed challenge and linking it to the current user. Multiple passkeys can be created for different devices/browsers.',
    request: { body: jsonBody(passkeyCreateBodySchema) },
    responses: { 201: json('Passkey created', passkeySchema, mockPasskeyResponse()) },
  }),
  deletePasskey: xRoute({
    'x-strategy': null,
    method: 'delete',
    path: '/passkey/{id}',
    xGuard: [userGuard, stepUpGuard],
    xRateLimiter: [singlePointsLimiter],
    summary: 'Delete passkey',
    description: 'Delete a passkey by id from the current user.',
    request: { params: z.object({ id: validIdSchema }) },
    responses: { 204: { description: 'Passkey deleted' } },
  }),
  signInWithPasskey: xRoute({
    'x-strategy': 'passkey',
    method: 'post',
    path: '/passkey-verification',
    xGuard: [publicGuard],
    xRateLimiter: [tokenLimiter('passkey')],
    summary: 'Verify passkey',
    description: 'Validates the signed challenge and completes passkey based authentication.',
    request: { body: jsonBody(passkeyVerificationBodySchema) },
    responses: { 204: { description: 'Passkey verified', headers: z.object({ 'Set-Cookie': cookieSchema }) } },
  }),
});

export { authPasskeysRoutes };
