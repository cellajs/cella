import { registerModule } from 'shared/module-registry';

registerModule({
  name: 'ai',
  owner: 'cella',
  scope: ['backend'],
  description: `Endpoints exposing the AI capability layer, which is a server-side tool registry surfaced to
    external clients through a Model Context Protocol (MCP) endpoint. It ships no LLM transport or agent of its
    own; forks build AI features and agent products (such as chat) on top, reusing the same tool registry.`,
});
