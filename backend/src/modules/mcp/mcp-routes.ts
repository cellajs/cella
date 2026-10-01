import { z } from '@hono/zod-openapi';
import { createXRoutes, json, jsonBody, xRoute } from '#/core/x-routes';
import { orgGuard, publicGuard, serviceEnabled, tenantGuard, tokenGuard } from '#/middlewares/guard';
import { mcpRequestLimiter } from '#/middlewares/rate-limiter/limiters';
import { mockProtectedResourceResponse } from '#/modules/oauth-server/oauth-server-mocks';
import { protectedResourceSchema } from '#/modules/oauth-server/oauth-server-schema';
import { tenantOrgParamSchema } from '#/schemas';

const mcpRoutes = createXRoutes(['mcp', 'cella'], {
  getMcpProtectedResourceMetadata: xRoute({
    method: 'get',
    path: '/.well-known/oauth-protected-resource',
    xGuard: [serviceEnabled('mcp'), publicGuard],
    summary: 'Protected resource metadata',
    description:
      'RFC 9728 metadata of this organization MCP server: its resource identifier, the authorization server that issues tokens for it, and the scopes it understands.',
    request: { params: tenantOrgParamSchema },
    responses: { 200: json('Protected resource metadata', protectedResourceSchema, mockProtectedResourceResponse('mcp')) },
  }),
  handleMcp: xRoute({
    method: 'post',
    path: '/',
    xGuard: [serviceEnabled('mcp'), tokenGuard, tenantGuard, orgGuard],
    xRateLimiter: [mcpRequestLimiter],
    summary: 'MCP endpoint',
    description:
      'Model Context Protocol (JSON-RPC 2.0 over Streamable HTTP) endpoint. Requires an access token from the authorization server; exposes the MCP tools that modules registered (initialize, tools/list, tools/call). A call outside the token scopes answers 403 with a WWW-Authenticate challenge naming the scope to step up to.',
    request: { params: tenantOrgParamSchema, body: jsonBody(z.any()) },
    responses: { 200: json('JSON-RPC response', z.any()) },
  }),
});

export { mcpRoutes };
