import { createEntityHierarchy, createRoleRegistry, hierarchy } from 'shared';
import { describe, expect, it } from 'vitest';

// Counter recovery and CDC must use the same deepest non-null ancestor.
describe('deepestAncestorSql', () => {
  it('two-level hierarchy: product groups by parent context, then organization', () => {
    const roles = createRoleRegistry(['admin', 'member'] as const);
    const h = createEntityHierarchy(roles)
      .user()
      .organization({ roles: roles.all })
      .channel('project', { parent: 'organization', roles: roles.all })
      .product('task', { parent: 'project' })
      .build();

    expect(h.deepestAncestorSql('task', 't')).toBe('COALESCE(t.project_id, t.organization_id)');
  });

  it('organization has no grouping expression (it is present in every hierarchy)', () => {
    expect(hierarchy.deepestAncestorSql('organization', 't')).toBeNull();
  });

  it('deep hierarchy: ancestors coalesce most-specific first', () => {
    const roles = createRoleRegistry(['admin', 'member'] as const);
    const h = createEntityHierarchy(roles)
      .user()
      .organization({ roles: roles.all })
      .channel('course', { parent: 'organization', roles: roles.all })
      .channel('courseSection', { parent: 'course', roles: roles.all })
      .channel('project', { parent: 'courseSection', roles: roles.all })
      .product('item', { parent: 'project', nullableAncestors: ['project', 'courseSection'] })
      .build();

    expect(h.deepestAncestorSql('item', 't')).toBe('COALESCE(t.project_id, t.course_section_id, t.course_id, t.organization_id)');
  });
});
