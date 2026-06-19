import { z } from '@hono/zod-openapi';
import { createXRoute } from '#/core/x-routes';
import { authGuard } from '#/middlewares/guard';
import { singlePointsLimiter } from '#/middlewares/rate-limiter/limiters';
import { errorResponseRefs, maxLength } from '#/schemas';

const yjsTokenQuerySchema = z.object({
  entityType: z.string().max(50),
  tenantId: z.string().max(maxLength.id),
  organizationId: z.string().max(maxLength.id),
});

const yjsTokenResponseSchema = z.object({
  token: z.string(),
});

const yjsVerifyEntityQuerySchema = z.object({
  entityType: z.string().max(50),
  entityId: z.string().max(maxLength.id),
  tenantId: z.string().max(maxLength.id),
  userId: z.string().max(maxLength.id),
});

const yjsVerifyEntityResponseSchema = z.object({
  allowed: z.boolean(),
});

const yjsRoutes = {
  getYjsToken: createXRoute({
    method: 'get',
    path: '/token',
    'x-service': 'yjs',
    xGuard: [authGuard],
    xRateLimiter: [singlePointsLimiter],
    tags: ['yjs', 'cella'],
    operationId: 'getYjsToken',
    summary: 'Get Yjs token',
    description:
      'Returns a context-scoped HMAC-signed token for a specific entity type. The token proves the user has update permission and can be verified by the Yjs relay worker without a backend callback.',
    request: {
      query: yjsTokenQuerySchema,
    },
    responses: {
      200: {
        description: 'Yjs auth token',
        content: { 'application/json': { schema: yjsTokenResponseSchema } },
      },
      ...errorResponseRefs,
    },
  }),
  verifyEntity: createXRoute({
    method: 'get',
    path: '/verify-entity',
    'x-service': 'yjs',
    xGuard: [],
    tags: ['yjs', 'cella'],
    operationId: 'verifyYjsEntity',
    summary: 'Verify Yjs entity access',
    description:
      'Called by the Yjs relay worker to verify that a specific entity exists and the user has update access. Authenticated via shared YJS_SECRET header.',
    request: {
      query: yjsVerifyEntityQuerySchema,
    },
    responses: {
      200: {
        description: 'Access check result',
        content: { 'application/json': { schema: yjsVerifyEntityResponseSchema } },
      },
    },
  }),
};

export default yjsRoutes;
