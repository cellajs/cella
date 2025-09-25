import { z } from '@hono/zod-openapi';
import { createCustomRoute } from '#/lib/custom-routes';
import { isAuthenticated, isPublicAccess } from '#/middlewares/guard';
import { spamLimiter } from '#/middlewares/rate-limiter/limiters';
import { totpVerificationBodySchema } from './schema';
import { cookieSchema } from '#/utils/schema/common';
import { errorResponses, successWithoutDataSchema } from '#/utils/schema/responses';

const authTotpsRoutes = {
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

  verifyTotp: createCustomRoute({
    operationId: 'signInWithTotp',
    method: 'post',
    path: '/totp-verification',
    guard: isPublicAccess,
    // TODO look into rate limit customized for totp
    middleware: [spamLimiter],
    tags: ['auth'],
    summary: 'Verify TOTP',
    description: 'Validates the TOTP code and completes TOTP based authentication.',
    security: [],
    request: {
      body: { content: { 'application/json': { schema: totpVerificationBodySchema } } },
    },
    responses: {
      200: {
        description: 'TOTP verified',
        headers: z.object({ 'Set-Cookie': cookieSchema }),
        content: { 'application/json': { schema: successWithoutDataSchema } },
      },
      ...errorResponses,
    },
  }),
};

export default authTotpsRoutes;
