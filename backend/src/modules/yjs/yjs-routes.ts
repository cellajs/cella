import { z } from '@hono/zod-openapi';
import { createXRoute } from '#/core/x-routes';
import { authGuard } from '#/middlewares/guard';
import { singlePointsLimiter } from '#/middlewares/rate-limiter/limiters';
import { errorResponseRefs, maxLength, productEntityTypeSchema } from '#/schemas';

const yjsTokenQuerySchema = z.object({
  entityType: productEntityTypeSchema,
  tenantId: z.string().max(maxLength.id),
  organizationId: z.string().max(maxLength.id),
});

const yjsTokenResponseSchema = z.object({
  token: z.string(),
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
};

export { yjsRoutes };
