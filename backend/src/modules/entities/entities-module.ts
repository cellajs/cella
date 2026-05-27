import { registerTag } from '#/core/tag-registry';

registerTag({
  tag: 'entities',
  kind: 'module',
  parent: 'cella',
  description: `Endpoints that operate across multiple *entity types*, such as \`users\` and \`organizations\`.
    *Entities* are identifiable domain objects that may be contextual, hierarchical (with parent/child
    relations), or actor-like. These endpoints offer shared logic across modules, including slug validation
    and entity visibility.`,
});
