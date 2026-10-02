import { AppError } from '#/core/error';
import { xMiddleware } from '#/core/x-middleware';
import { routeTarget, setActorFromToken, unauthorized } from '#/middlewares/guard/service-guard';
import { resourceMetadataUrl } from '#/modules/oauth-server/resources';
import { bearerJwtFrom } from '#/modules/oauth-server/verify-access-token';

/**
 * The MCP face accepts only tokens from the app's own authorization server (D12): no sessions, no API keys. A missing or
 * invalid token answers with the RFC 9728 challenge, which is how an MCP client discovers where to authorize. It charges
 * no burst budget: a tool call counts once, at the route it runs (`serviceGuard`), and the endpoint's own requests
 * count against `mcpRequestLimiter`.
 */
export const tokenGuard = xMiddleware(
  {
    functionName: 'tokenGuard',
    type: 'x-guard',
    security: [{ oauth2: [] }],
    name: 'token',
    description: 'Requires an access token, no session or API key; acts as its service account or consenting user, limited to its scopes',
  },
  async (ctx, next) => {
    const target = routeTarget(ctx);
    if (!target.organizationId) throw new AppError(400, 'invalid_request', 'error', { meta: { reason: 'Missing organizationId parameter' } });
    const metadata = resourceMetadataUrl({ face: 'mcp', tenantId: target.tenantId, organizationId: target.organizationId });

    const jwt = bearerJwtFrom(ctx);
    if (!jwt) {
      ctx.header('WWW-Authenticate', `Bearer resource_metadata="${metadata}"`);
      throw unauthorized('missing_token');
    }
    try {
      await setActorFromToken(ctx, jwt, target);
    } catch (error) {
      const reason = error instanceof AppError ? String(error.meta?.reason ?? 'invalid_token') : 'invalid_token';
      ctx.header('WWW-Authenticate', `Bearer error="invalid_token", error_description="${reason}", resource_metadata="${metadata}"`);
      throw error;
    }
    await next();
  },
);
