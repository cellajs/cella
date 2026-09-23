import { z } from '@hono/zod-openapi';
import { createXRoute } from '#/core/x-routes';
import { publicGuard } from '#/middlewares/guard';
import { errorResponseRefs, tenantOnlyParamSchema } from '#/schemas';

/** RFC 9728 protected resource metadata: what a client reads to find the authorization server of a resource. */
export const protectedResourceSchema = z
  .object({
    resource: z.string(),
    authorization_servers: z.array(z.string()),
    scopes_supported: z.array(z.string()),
    bearer_methods_supported: z.array(z.string()),
    resource_documentation: z.string(),
  })
  .openapi('ProtectedResourceMetadata');

const oauthServerRoutes = {
  getApiProtectedResourceMetadata: createXRoute({
    'x-service': 'oauth',
    operationId: 'getApiProtectedResourceMetadata',
    method: 'get',
    path: '/{tenantId}/.well-known/oauth-protected-resource',
    xGuard: [publicGuard],
    tags: ['oauth-server', 'cella'],
    summary: 'Protected resource metadata (API)',
    description:
      'RFC 9728 metadata of this tenant as an API resource: its resource identifier, the authorization server that issues tokens for it, and the scopes it understands.',
    request: { params: tenantOnlyParamSchema },
    responses: {
      200: {
        description: 'Protected resource metadata',
        content: { 'application/json': { schema: protectedResourceSchema } },
      },
      ...errorResponseRefs,
    },
  }),
};

export { oauthServerRoutes };
