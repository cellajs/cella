import { createEntityHierarchy, createRoleRegistry } from 'shared';
import { describe, expect, it } from 'vitest';
import { deepestAncestorExpr } from './recalculate-counters';

// Counter recovery and CDC must use the same deepest non-null ancestor. Synthetic
// hierarchies keep this SQL-shape assertion independent of a fork's entity structure.
describe('deepestAncestorExpr', () => {
  it('two-level hierarchy: product groups by parent context, then organization', () => {
    const roles = createRoleRegistry(['admin', 'member'] as const);
    const h = createEntityHierarchy(roles)
      .user()
      .channel('organization', { parent: null, roles: roles.all })
      .channel('project', { parent: 'organization', roles: roles.all })
      .product('task', { parent: 'project' })
      .build();

    expect(deepestAncestorExpr('task', 't', h)).toBe('COALESCE(t.project_id, t.organization_id)');
  });

  it('root context has no grouping expression (organization is guaranteed present in every hierarchy)', () => {
    expect(deepestAncestorExpr('organization', 't')).toBeNull();
  });

  it('deep hierarchy: ancestors coalesce most-specific first', () => {
    const roles = createRoleRegistry(['admin', 'member'] as const);
    const h = createEntityHierarchy(roles)
      .user()
      .channel('organization', { parent: null, roles: roles.all })
      .channel('course', { parent: 'organization', roles: roles.all })
      .channel('courseSection', { parent: 'course', roles: roles.all })
      .channel('project', { parent: 'courseSection', roles: roles.all })
      .product('item', { parent: 'project', nullableAncestors: ['project', 'courseSection'] })
      .build();

    expect(deepestAncestorExpr('item', 't', h)).toBe(
      'COALESCE(t.project_id, t.course_section_id, t.course_id, t.organization_id)',
    );
  });
});
