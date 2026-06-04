import { registerTag } from '#/core/tag-registry';

registerTag({
  tag: 'ai',
  kind: 'module',
  parent: 'cella',
  description:
    'Endpoints for AI chat sessions. Supports streaming LLM responses via SSE, per-user chat sessions scoped to a workspace (organization), and tool calling for workspace actions.',
});
