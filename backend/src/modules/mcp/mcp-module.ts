import { defineBackendModule } from '#/lib/module';
import { mcpMountPath } from '#/modules/mcp/mcp-routes';
import { mcpHandlers } from './mcp-handlers';

defineBackendModule({
  name: 'mcp',
  owner: 'cella',
  scope: ['backend'],
  description: `Endpoints exposing the AI capability layer, which is a server-side MCP tool registry surfaced to
    external clients through a Model Context Protocol (MCP) endpoint. It ships no LLM transport or agent of its
    own; apps build AI features and agent products (such as chat) on top, reusing the same MCP tool registry.`,
  routes: [{ path: mcpMountPath, app: mcpHandlers, phase: 'tenant' }],
});
