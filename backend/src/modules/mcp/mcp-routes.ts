import { z } from '@hono/zod-openapi';
import { createXRoute } from '#/core/x-routes';
import { orgGuard, tenantGuard } from '#/middlewares/guard';
import { mcpAuthGuard } from '#/modules/mcp/mcp-auth-guard';
import { errorResponseRefs, tenantOrgParamSchema } from '#/schemas';

const mcpRoutes = {
  handleMcp: createXRoute({
    'x-service': 'mcp',
    operationId: 'handleMcp',
    method: 'post',
    path: '/',
    // Bearer-only: MCP clients authenticate with an OAuth JWT (no session cookie).
    xGuard: [mcpAuthGuard, tenantGuard, orgGuard],
    // Override the default cookieAuth scheme — MCP advertises only HTTP bearer.
    security: [{ mcpBearerAuth: [] }],
    tags: ['mcp', 'cella'],
    summary: 'MCP endpoint',
    description:
      'Model Context Protocol (JSON-RPC 2.0) endpoint. Authenticates with an OAuth Bearer JWT (audience-bound to the MCP resource) and exposes the workspace-scoped server tool registry to MCP clients (initialize, tools/list, tools/call).',
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
