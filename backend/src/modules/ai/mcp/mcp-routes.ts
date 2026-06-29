import { z } from '@hono/zod-openapi';
import { createXRoute } from '#/core/x-routes';
import { authGuard, orgGuard, tenantGuard } from '#/middlewares/guard';
import { errorResponseRefs, tenantOrgParamSchema } from '#/schemas';

const mcpRoutes = {
  handleMcp: createXRoute({
    'x-service': 'ai',
    operationId: 'handleMcp',
    method: 'post',
    path: '/',
    xGuard: [authGuard, tenantGuard, orgGuard],
    tags: ['ai', 'cella'],
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

export default mcpRoutes;
