import { registerTag } from '#/core/tag-registry';

registerTag({
  tag: 'seen',
  kind: 'module',
  parent: 'cella',
  description: 'Endpoints for tracking entity view counts and marking entities as seen by the current user.',
});
