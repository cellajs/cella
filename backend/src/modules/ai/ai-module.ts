import { registerTag } from '#/core/tag-registry';

registerTag({
  tag: 'ai',
  kind: 'module',
  parent: 'cella',
  description:
    'AI capability layer: a server-side tool registry and a Model Context Protocol (MCP) endpoint that exposes that registry to external MCP clients. Ships no LLM transport or agent of its own — forks build AI features and agent products (e.g. chat) on top, reusing the same tool registry.',
});
