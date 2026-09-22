import { OpenAPIHono } from '@hono/zod-openapi';
import { appConfig, scopes } from 'shared';
import type { Env } from '#/core/context';
import { oauthServerRoutes } from '#/modules/oauth-server/oauth-server-routes';
import { resourceUri } from '#/modules/oauth-server/resources';
import { defaultHook } from '#/utils/default-hook';

const app = new OpenAPIHono<Env>({ defaultHook });

app.openapi(oauthServerRoutes.getApiProtectedResourceMetadata, async (ctx) => {
  const { tenantId } = ctx.req.valid('param');
  return ctx.json(
    {
      resource: resourceUri({ face: 'api', tenantId: tenantId.toLowerCase() }),
      authorization_servers: [appConfig.oauthUrl],
      scopes_supported: [...scopes.all],
      bearer_methods_supported: ['header'],
      resource_documentation: `${appConfig.frontendUrl}/docs`,
    },
    200,
  );
});

export const oauthServerHandlers = app;
