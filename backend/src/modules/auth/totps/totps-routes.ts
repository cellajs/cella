import { z } from '@hono/zod-openapi';
import { createXRoutes, json, jsonBody, xRoute } from '#/core/x-routes';
import { publicGuard, stepUpGuard, userGuard } from '#/middlewares/guard';
import { singlePointsLimiter, totpVerificationLimiter } from '#/middlewares/rate-limiter/limiters';
import { mockTotpKeyResponse } from '#/modules/auth/auth-mocks';
import { totpCreateBodySchema } from '#/modules/auth/totps/totps-schema';
import { cookieSchema } from '#/schemas';

const authTotpsRoutes = createXRoutes(['auth', 'cella'], {
  generateTotpKey: xRoute({
    method: 'post',
    path: '/totp/generate-key',
    xEnabledBy: { strategy: 'totp' },
    xGuard: [userGuard, stepUpGuard],
    xRateLimiter: [singlePointsLimiter],
    summary: 'Generate TOTP key',
    description: 'Generates a new TOTP key for current user and returns a provisioning URI and Base32 manual key.',
    responses: { 200: json('Challenge created', z.object({ totpUri: z.string(), manualKey: z.string() }), mockTotpKeyResponse()) },
  }),
  createTotp: xRoute({
    method: 'post',
    path: '/totp',
    xEnabledBy: { strategy: 'totp' },
    xGuard: [userGuard, stepUpGuard],
    xRateLimiter: [singlePointsLimiter],
    summary: 'Set TOTP',
    description:
      'Confirms TOTP setup by verifying a code from the authenticator app for the first time. On success, TOTP is registered for current user.',
    request: { body: jsonBody(totpCreateBodySchema.pick({ code: true })) },

    responses: { 201: { description: 'TOTP created' } },
  }),
  deleteTotp: xRoute({
    method: 'delete',
    path: '/totp',
    xGuard: [userGuard, stepUpGuard],
    xRateLimiter: [singlePointsLimiter],
    summary: 'Delete TOTP',
    description: 'Delete TOTP credential for current user.',
    responses: { 204: { description: 'TOTP deleted' } },
  }),
  signInWithTotp: xRoute({
    method: 'post',
    path: '/totp-verification',
    xEnabledBy: { strategy: 'totp' },
    xGuard: [publicGuard],
    xRateLimiter: [totpVerificationLimiter],
    summary: 'Verify TOTP',
    description: 'Validates the TOTP code and completes TOTP based authentication.',
    request: { body: jsonBody(totpCreateBodySchema) },
    responses: { 204: { description: 'TOTP verified', headers: z.object({ 'Set-Cookie': cookieSchema }) } },
  }),
});

export { authTotpsRoutes };
