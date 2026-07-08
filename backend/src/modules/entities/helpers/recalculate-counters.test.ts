import { createEntityHierarchy, createRoleRegistry } from 'shared';
import { describe, expect, it } from 'vitest';
import { deepestAncestorExpr } from './recalculate-counters';

/**
 * Recalculation must group seq counters by the same deepest-non-null-ancestor rule CDC
 * stamps them with (`resolveContextKey`), or recovery fights live CDC. The full pipeline
 * runs against real fork tables; the grouping SQL shape is asserted here on synthetic
 * hierarchies built inline (plus one architectural invariant — organization is always the
 * root context and has no ancestors — true in every fork), so the assertions are fork-independent.
 */
describe('deepestAncestorExpr', () => {
  it('two-level hierarchy: product groups by parent context, then organization', () => {
    const roles = createRoleRegistry(['admin', 'member'] as const);
    const h = createEntityHierarchy(roles)
      .user()
      .context('organization', { parent: null, roles: roles.all })
      .context('project', { parent: 'organization', roles: roles.all })
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
      .context('organization', { parent: null, roles: roles.all })
      .context('course', { parent: 'organization', roles: roles.all })
      .context('courseSection', { parent: 'course', roles: roles.all })
      .context('project', { parent: 'courseSection', roles: roles.all })
      .product('item', { parent: 'project', nullableAncestors: ['project', 'courseSection'] })
      .build();

    expect(deepestAncestorExpr('item', 't', h)).toBe(
      'COALESCE(t.project_id, t.course_section_id, t.course_id, t.organization_id)',
    );
  });
});
