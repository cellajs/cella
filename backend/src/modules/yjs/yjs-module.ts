import { registerTag } from '#/core/tag-registry';

registerTag({
  tag: 'yjs',
  kind: 'module',
  parent: 'cella',
  description: `Endpoints for Yjs collaborative editing support. Provides auth tokens for the Yjs relay worker and
    accepts client-computed derived fields from collaborative editing sessions.`,
});
