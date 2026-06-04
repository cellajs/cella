import { registerTag } from '#/core/tag-registry';

registerTag({
  tag: 'tenants',
  kind: 'module',
  parent: 'cella',
  description: `System-level endpoints for managing *tenants*. Tenants are top-level isolation boundaries used by
    Row-Level Security (RLS) to partition data. Only system administrators can manage tenants.`,
});
