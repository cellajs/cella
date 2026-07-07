import { z } from '@hono/zod-openapi';
import { createXRoute } from '#/core/x-routes';
import { authGuard, publicGuard } from '#/middlewares/guard';
import { singlePointsLimiter, totpVerificationLimiter } from '#/middlewares/rate-limiter/limiters';
import { mockTotpKeyResponse } from '#/modules/auth/auth-mocks';
import { totpCreateBodySchema } from '#/modules/auth/totps/totps-schema';
import { cookieSchema, errorResponseRefs } from '#/schemas';

const authTotpsRoutes = {
  /**
   * Generate TOTP key
   */
  generateTotpKey: createXRoute({
    operationId: 'generateTotpKey',
    method: 'post',
    path: '/totp/generate-key',
    xGuard: [authGuard],
    xRateLimiter: [singlePointsLimiter],
    tags: ['auth', 'cella'],
    summary: 'Generate TOTP key',
    description: 'Generates a new TOTP key for current user and returns a provisioning URI and Base32 manual key.',
    responses: {
      200: {
        description: 'Challenge created',
        content: {
          'application/json': {
            schema: z.object({ totpUri: z.string(), manualKey: z.string() }),
            example: mockTotpKeyResponse(),
          },
        },
      },
      ...errorResponseRefs,
    },
  }),
  /**
   * Set TOTP
   */
  createTotp: createXRoute({
    operationId: 'createTotp',
    method: 'post',
    path: '/totp',
    xGuard: [authGuard],
    xRateLimiter: [singlePointsLimiter],
    tags: ['auth', 'cella'],
    summary: 'Set TOTP',
    description:
      'Confirms TOTP setup by verifying a code from the authenticator app for the first time. On success, TOTP is registered for current user.',
    request: {
      body: {
        required: true,
        content: { 'application/json': { schema: totpCreateBodySchema.pick({ code: true }) } },
      },
    },

    responses: {
      201: {
        description: 'TOTP created',
      },
      ...errorResponseRefs,
    },
  }),
  /**
   * Delete TOTP
   */
  deleteTotp: createXRoute({
    operationId: 'deleteTotp',
    method: 'delete',
    path: '/totp',
    xGuard: [authGuard],
    xRateLimiter: [singlePointsLimiter],
    tags: ['auth', 'cella'],
    summary: 'Delete TOTP',
    description: 'Delete TOTP credential for current user.',
    responses: {
      204: { description: 'TOTP deleted' },
      ...errorResponseRefs,
    },
  }),
  /**
   * Verify TOTP
   */
  signInWithTotp: createXRoute({
    operationId: 'signInWithTotp',
    method: 'post',
    path: '/totp-verification',
    xGuard: [publicGuard],
    xRateLimiter: [totpVerificationLimiter],
    tags: ['auth', 'cella'],
    summary: 'Verify TOTP',
    description: 'Validates the TOTP code and completes TOTP based authentication.',
    request: {
      body: {
        required: true,
        content: { 'application/json': { schema: totpCreateBodySchema } },
      },
    },
    responses: {
      204: {
        description: 'TOTP verified',
        headers: z.object({ 'Set-Cookie': cookieSchema }),
      },
      ...errorResponseRefs,
    },
  }),
};

export { authTotpsRoutes };
