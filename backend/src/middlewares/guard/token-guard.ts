import { AppError } from '#/core/error';
import { xMiddleware } from '#/core/x-middleware';
import { missingRouteParam, routeTarget } from '#/middlewares/guard/route-target';
import { setActorFromToken, unauthorized } from '#/middlewares/guard/service-guard';
import { mcpInitialScope, resourceMetadataUrl } from '#/modules/oauth-server/resources';
import { bearerJwtFrom } from '#/modules/oauth-server/verify-access-token';

/**
 * The MCP face accepts only tokens from the app's own authorization server: no sessions, no API keys. A missing or
 * invalid token answers with the RFC 9728 challenge, which is how an MCP client discovers where to authorize. It charges
 * no burst budget: a tool call counts once, at the route it runs (`serviceGuard`), and the endpoint's own requests
 * count against `mcpRequestLimiter`.
 */
export const tokenGuard = xMiddleware(
  {
    functionName: 'tokenGuard',
    type: 'x-guard',
    errors: [401],
    security: [{ oauth2: [] }],
    provides: ['actor'],
    name: 'Access token',
    description: 'Works only with an access token. The request acts as the service account, or the user who gave consent, within the scopes granted.',
  },
  async (ctx, next) => {
    const target = routeTarget(ctx);
    if (!target.organizationId) throw missingRouteParam('organizationId');
    const metadata = resourceMetadataUrl({ face: 'mcp', tenantId: target.tenantId, organizationId: target.organizationId });

    const scopeAttr = mcpInitialScope ? `, scope="${mcpInitialScope}"` : '';

    const jwt = bearerJwtFrom(ctx);
    if (!jwt) {
      ctx.header('WWW-Authenticate', `Bearer resource_metadata="${metadata}"${scopeAttr}`);
      throw unauthorized('missing_token');
    }
    try {
      await setActorFromToken(ctx, jwt, target);
    } catch (error) {
      const reason = error instanceof AppError ? String(error.meta?.reason ?? 'invalid_token') : 'invalid_token';
      ctx.header('WWW-Authenticate', `Bearer error="invalid_token", error_description="${reason}", resource_metadata="${metadata}"${scopeAttr}`);
      throw error;
    }
    await next();
  },
);
