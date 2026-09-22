import { z } from '@hono/zod-openapi';
import { createXRoute } from '#/core/x-routes';
import { orgGuard, tenantGuard, userGuard } from '#/middlewares/guard';
import { errorResponseRefs, tenantOrgParamSchema } from '#/schemas';

const mcpRoutes = {
  handleMcp: createXRoute({
    'x-service': 'mcp',
    operationId: 'handleMcp',
    method: 'post',
    path: '/',
    xGuard: [userGuard, tenantGuard, orgGuard],
    tags: ['mcp', 'cella'],
    summary: 'MCP endpoint',
    description:
      'Model Context Protocol (JSON-RPC 2.0) endpoint. Exposes the workspace-scoped server tool registry to MCP clients (initialize, tools/list, tools/call).',
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
