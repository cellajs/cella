import { z } from '@hono/zod-openapi';
import { createCustomRoute } from '#/lib/custom-routes';
import { isAuthenticated, isPublicAccess } from '#/middlewares/guard';
import { spamLimiter } from '#/middlewares/rate-limiter/limiters';
import { cookieSchema } from '#/utils/schema/common';
import { errorResponses, successWithoutDataSchema } from '#/utils/schema/responses';
import { totpCreateBodySchema } from './schema';

const authTotpsRoutes = {
  createTotpChallenge: createCustomRoute({
    operationId: 'createTotpChallenge',
    method: 'post',
    path: '/totp/register',
    guard: isAuthenticated,
    tags: ['auth'],
    summary: 'Create TOTP challenge',
    description: 'Generates a new TOTP challenge for current user and returns a provisioning URI and Base32 manual key.',
    security: [],
    responses: {
      200: {
        description: 'Challenge created',
        content: { 'application/json': { schema: z.object({ totpUri: z.string(), manualKey: z.string() }) } },
      },
      ...errorResponses,
    },
  }),

  createTotp: createCustomRoute({
    operationId: 'createTotp',
    method: 'post',
    path: '/totp/activate',
    guard: isAuthenticated,
    tags: ['auth'],
    summary: 'Activate TOTP',
    description:
      'Confirms TOTP setup by verifying a code from the authenticator app for the first time. On success, TOTP is registered for current user.',
    security: [],
    request: {
      body: {
        required: true,
        content: { 'application/json': { schema: totpCreateBodySchema.pick({ code: true }) } },
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
    tags: ['auth'],
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

  signInWithTotp: createCustomRoute({
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
      body: { content: { 'application/json': { schema: totpCreateBodySchema } } },
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
