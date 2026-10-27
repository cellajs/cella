import { z } from '@hono/zod-openapi';
import { createXRoutes, json, jsonBody, xRoute } from '#/core/x-routes';
import { orgGuard, publicGuard, tenantGuard, tokenGuard } from '#/middlewares/guard';
import { mcpRequestLimiter } from '#/middlewares/rate-limiter/limiters';
import { mockProtectedResourceResponse } from '#/modules/oauth-server/oauth-server-mocks';
import { protectedResourceSchema } from '#/modules/oauth-server/oauth-server-schema';
import { tenantOrgParamSchema } from '#/schemas';

/** Where the MCP endpoint is mounted, in the API process and the MCP worker alike: the path a token's audience names. */
export const mcpMountPath = '/:tenantId/:organizationId/mcp';

const mcpRoutes = createXRoutes(['mcp', 'cella'], {
  getMcpProtectedResourceMetadata: xRoute({
    method: 'get',
    path: '/.well-known/oauth-protected-resource',
    xEnabledBy: { service: 'mcp' },
    xGuard: [publicGuard],
    summary: 'Protected resource metadata',
    description:
      'RFC 9728 metadata of this organization MCP server: its resource identifier, the authorization server that issues tokens for it, and the scopes it understands.',
    request: { params: tenantOrgParamSchema },
    responses: { 200: json('Protected resource metadata', protectedResourceSchema, mockProtectedResourceResponse('mcp')) },
  }),
  handleMcp: xRoute({
    method: 'post',
    path: '/',
    xEnabledBy: { service: 'mcp' },
    xGuard: [tokenGuard, tenantGuard, orgGuard],
    xRateLimiter: [mcpRequestLimiter],
    summary: 'MCP endpoint',
    description:
      'Model Context Protocol (JSON-RPC 2.0 over Streamable HTTP) endpoint. Requires an access token from the authorization server; exposes the MCP tools that modules registered (initialize, tools/list, tools/call). A call outside the token scopes answers 403 with a WWW-Authenticate challenge naming the scope to step up to; in a batch it gets its own insufficient_scope error, the other calls keep their results, and the 200 carries the challenge.',
    request: { params: tenantOrgParamSchema, body: jsonBody(z.any()) },
    responses: { 200: json('JSON-RPC response', z.any()) },
  }),
});

export { mcpRoutes };
