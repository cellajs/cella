import { z } from '@hono/zod-openapi';
import { createXRoutes, json, xRoute } from '#/core/x-routes';
import { publicGuard, serviceEnabled } from '#/middlewares/guard';
import { tenantOnlyParamSchema } from '#/schemas';

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

const oauthServerRoutes = createXRoutes(['oauth-server', 'cella'], {
  getApiProtectedResourceMetadata: xRoute({
    method: 'get',
    path: '/{tenantId}/.well-known/oauth-protected-resource',
    xGuard: [serviceEnabled('oauth'), publicGuard],
    summary: 'Protected resource metadata (API)',
    description:
      'RFC 9728 metadata of this tenant as an API resource: its resource identifier, the authorization server that issues tokens for it, and the scopes it understands.',
    request: { params: tenantOnlyParamSchema },
    responses: { 200: json('Protected resource metadata', protectedResourceSchema) },
  }),
});

export { oauthServerRoutes };
