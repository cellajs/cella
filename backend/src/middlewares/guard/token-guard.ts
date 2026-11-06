import type { Context } from 'hono';
import type { Env } from '#/core/context';
import { xMiddleware } from '#/core/x-middleware';
import { missingRouteParam, routeTarget } from '#/middlewares/guard/route-target';
import { challengeRefusal, setActorFromToken, unauthorized } from '#/middlewares/guard/service-guard';
import { bearerChallenge, type ResourceRef } from '#/modules/oauth-server/resources';
import { bearerJwtFrom } from '#/modules/oauth-server/verify-access-token';

/** Any bearer value or API key header, valid or not. */
const presentsProof = (ctx: Context<Env>) => !!ctx.req.header('authorization')?.toLowerCase().startsWith('bearer ') || !!ctx.req.header('x-api-key');

/**
 * The MCP face accepts only tokens from the app's own authorization server: no sessions, no API keys. A request without
 * a token answers with the RFC 9728 challenge, which is how an MCP client discovers where to authorize; an invalid token
 * or any other proof answers `invalid_token`. It charges no burst budget: a tool call counts once, at the route it runs
 * (`serviceGuard`), and the endpoint's own requests count against `mcpRequestLimiter`.
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
    const ref: ResourceRef = { face: 'mcp', tenantId: target.tenantId, organizationId: target.organizationId };

    const jwt = bearerJwtFrom(ctx);
    if (!jwt && !presentsProof(ctx)) {
      ctx.header('WWW-Authenticate', bearerChallenge(ref));
      throw unauthorized('missing_token');
    }
    await challengeRefusal(ctx, ref, async () => {
      if (!jwt) throw unauthorized('access_token_required');
      await setActorFromToken(ctx, jwt, target);
    });
    await next();
  },
);
