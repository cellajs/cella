import { registerTag } from '#/core/tag-registry';

registerTag({
  tag: 'metrics',
  kind: 'module',
  parent: 'cella',
  description: 'Endpoints for retrieving high-level counts for entities such as `users` and `organizations`.',
});
