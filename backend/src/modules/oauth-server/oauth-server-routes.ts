import { createXRoutes, json, xRoute } from '#/core/x-routes';
import { publicGuard } from '#/middlewares/guard';
import { mockProtectedResourceResponse } from '#/modules/oauth-server/oauth-server-mocks';
import { protectedResourceSchema } from '#/modules/oauth-server/oauth-server-schema';
import { tenantOnlyParamSchema } from '#/schemas';

const oauthServerRoutes = createXRoutes(['oauth-server', 'cella'], {
  getApiProtectedResourceMetadata: xRoute({
    method: 'get',
    path: '/{tenantId}/.well-known/oauth-protected-resource',
    xEnabledBy: { service: 'oauth' },
    xGuard: [publicGuard],
    summary: 'Protected resource metadata (API)',
    description:
      'RFC 9728 metadata of this tenant as an API resource: its resource identifier, the authorization server that issues tokens for it, and the scopes it understands.',
    request: { params: tenantOnlyParamSchema },
    responses: { 200: json('Protected resource metadata', protectedResourceSchema, mockProtectedResourceResponse()) },
  }),
});

export { oauthServerRoutes };
