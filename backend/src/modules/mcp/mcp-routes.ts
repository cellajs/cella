import { z } from '@hono/zod-openapi';
import { createXRoute } from '#/core/x-routes';
import { orgGuard, publicGuard, tenantGuard, tokenGuard } from '#/middlewares/guard';
import { errorResponseRefs, tenantOrgParamSchema } from '#/schemas';

/** RFC 9728 protected resource metadata: what an MCP client reads to find the authorization server. */
const protectedResourceSchema = z
  .object({
    resource: z.string(),
    authorization_servers: z.array(z.string()),
    scopes_supported: z.array(z.string()),
    bearer_methods_supported: z.array(z.string()),
    resource_documentation: z.string(),
  })
  .openapi('ProtectedResourceMetadata');

const mcpRoutes = {
  getProtectedResourceMetadata: createXRoute({
    'x-service': 'mcp',
    operationId: 'getProtectedResourceMetadata',
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
      'Model Context Protocol (JSON-RPC 2.0 over Streamable HTTP) endpoint. Requires an access token from the authorization server; exposes the tools modules registered (initialize, tools/list, tools/call). A call outside the token scopes answers 403 with a WWW-Authenticate challenge naming the scope to step up to.',
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
