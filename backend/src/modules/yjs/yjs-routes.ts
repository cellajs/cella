import { z } from '@hono/zod-openapi';
import { createXRoute } from '#/core/x-routes';
import { orgGuard, tenantGuard, userGuard } from '#/middlewares/guard';
import { singlePointsLimiter } from '#/middlewares/rate-limiter/limiters';
import { errorResponseRefs, productEntityTypeSchema, tenantOrgParamSchema, validIdSchema } from '#/schemas';

const yjsTokenQuerySchema = z.object({
  entityType: productEntityTypeSchema,
  entityId: validIdSchema,
});

const yjsTokenResponseSchema = z.object({
  token: z.string(),
});

const yjsRoutes = {
  getYjsToken: createXRoute({
    method: 'get',
    path: '/token',
    'x-service': 'yjs',
    xGuard: [userGuard, tenantGuard, orgGuard],
    xRateLimiter: [singlePointsLimiter],
    tags: ['yjs', 'cella'],
    operationId: 'getYjsToken',
    summary: 'Get Yjs token',
    description:
      'Returns an Ed25519-signed token for collaboratively editing one product entity the caller may update. It names the entity, its tenant and organization, and expires after five minutes; the Yjs relay worker verifies it with the public key alone, without a backend callback, and closes the socket when it expires.',
    request: {
      params: tenantOrgParamSchema,
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
};

export { yjsRoutes };
