import { registerTag } from '#/core/tag-registry';

registerTag({
  tag: 'organizations',
  kind: 'module',
  parent: 'cella',
  description: `Endpoints for managing \`organizations\`, which are core context entities. Organizations are
    the highest ancestor in the parent hierarchy. They define access boundaries and are often the minimal
    primary scope for permission and resource management.`,
});
