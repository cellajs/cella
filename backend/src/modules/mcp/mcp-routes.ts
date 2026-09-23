import { z } from '@hono/zod-openapi';
import { createXRoute } from '#/core/x-routes';
import { orgGuard, publicGuard, tenantGuard, tokenGuard } from '#/middlewares/guard';
import { protectedResourceSchema } from '#/modules/oauth-server/oauth-server-routes';
import { errorResponseRefs, tenantOrgParamSchema } from '#/schemas';

const mcpRoutes = {
  getMcpProtectedResourceMetadata: createXRoute({
    'x-service': 'mcp',
    operationId: 'getMcpProtectedResourceMetadata',
    method: 'get',
    path: '/.well-known/oauth-protected-resource',
    xGuard: [publicGuard],
    tags: ['mcp', 'cella'],
    summary: 'Protected resource metadata',
    description:
      'RFC 9728 metadata of this organization MCP server: its resource identifier, the authorization server that issues tokens for it, and the scopes it understands.',
    request: { params: tenantOrgParamSchema },
    responses: {
      200: {
        description: 'Protected resource metadata',
        content: { 'application/json': { schema: protectedResourceSchema } },
      },
      ...errorResponseRefs,
    },
  }),
  handleMcp: createXRoute({
    'x-service': 'mcp',
    operationId: 'handleMcp',
    method: 'post',
    path: '/',
    xGuard: [tokenGuard, tenantGuard, orgGuard],
    tags: ['mcp', 'cella'],
    summary: 'MCP endpoint',
    description:
      'Model Context Protocol (JSON-RPC 2.0 over Streamable HTTP) endpoint. Requires an access token from the authorization server; exposes the MCP tools that modules registered (initialize, tools/list, tools/call). A call outside the token scopes answers 403 with a WWW-Authenticate challenge naming the scope to step up to.',
    request: {
      params: tenantOrgParamSchema,
      body: { required: true, content: { 'application/json': { schema: z.any() } } },
    },
    responses: {
      200: {
        description: 'JSON-RPC response',
        content: { 'application/json': { schema: z.any() } },
      },
      ...errorResponseRefs,
    },
  }),
};

export { mcpRoutes };
