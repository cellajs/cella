import { AppError } from '#/core/error';
import { xMiddleware } from '#/core/x-middleware';
import { invalidKey, setActorFromToken } from '#/middlewares/guard/service-guard';
import { serviceBurstLimiter } from '#/middlewares/rate-limiter/limiters';
import { resourceMetadataUrl } from '#/modules/oauth-server/resources';
import { bearerJwtFrom } from '#/modules/oauth-server/verify-access-token';

/**
 * The MCP face accepts only tokens from the app's own authorization server (D12): no sessions, no API keys. A missing or
 * invalid token answers with the RFC 9728 challenge, which is how an MCP client discovers where to authorize.
 */
export const tokenGuard = xMiddleware(
  {
    functionName: 'tokenGuard',
    type: 'x-guard',
    name: 'token',
    description:
      'Requires an access token from the authorization server and sets the consenting user or service account as the actor',
  },
  async (ctx, next) => {
    const tenantId = ctx.req.param('tenantId')?.toLowerCase();
    const organizationId = ctx.req.param('organizationId');
    if (!tenantId || !organizationId)
      throw new AppError(400, 'invalid_request', 'error', { meta: { reason: 'Missing tenantId or organizationId' } });
    const metadata = resourceMetadataUrl({ face: 'mcp', tenantId, organizationId });

    const jwt = bearerJwtFrom(ctx);
    if (!jwt) {
      ctx.header('WWW-Authenticate', `Bearer resource_metadata="${metadata}"`);
      throw invalidKey('missing_token');
    }
    try {
      await setActorFromToken(ctx, jwt);
    } catch (error) {
      const reason = error instanceof AppError ? String(error.meta?.reason ?? 'invalid_token') : 'invalid_token';
      ctx.header(
        'WWW-Authenticate',
        `Bearer error="invalid_token", error_description="${reason}", resource_metadata="${metadata}"`,
      );
      throw error;
    }
    return serviceBurstLimiter(ctx, next);
  },
);
