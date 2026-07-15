import { describe, expect, it } from 'vitest';
import { createEntityHierarchy, createRoleRegistry } from '../entity-hierarchy';
import { possibleHomeChannels, resolveDeepestAncestorId, resolveNonNullAncestors } from '../resolve-row-channel';

/**
 * Synthetic deep hierarchy (projectcampus-shaped): 4 context levels with an `item` product
 * whose rows attach at any depth. raak/cella configs cannot exhibit variable-depth rows
 * (no nullable ancestors), so the rule is proven here.
 */
describe('resolve-row-channel (deepest non-null ancestor rule)', () => {
  const roles = createRoleRegistry(['admin', 'member'] as const);
  const h = createEntityHierarchy(roles)
    .user()
    .channel('organization', { parent: null, roles: roles.all })
    .channel('course', { parent: 'organization', roles: roles.all })
    .channel('courseSection', { parent: 'course', roles: roles.all })
    .channel('project', { parent: 'courseSection', roles: roles.all })
    .product('item', { parent: 'project', nullableAncestors: ['project', 'courseSection'] })
    .product('task', { parent: 'project' })
    .build();

  const fullDepthRow = {
    id: 'i1',
    projectId: 'p1',
    courseSectionId: 's1',
    courseId: 'c1',
    organizationId: 'o1',
  };

  describe('resolveNonNullAncestors', () => {
    it('returns all non-null ancestors most-specific first', () => {
      expect(resolveNonNullAncestors(h, 'item', fullDepthRow)).toEqual([
        { type: 'project', idColumn: 'projectId', id: 'p1' },
        { type: 'courseSection', idColumn: 'courseSectionId', id: 's1' },
        { type: 'course', idColumn: 'courseId', id: 'c1' },
        { type: 'organization', idColumn: 'organizationId', id: 'o1' },
      ]);
    });

    it('skips null ancestor ids (variable-depth row)', () => {
      const sectionRow = { ...fullDepthRow, projectId: null };
      expect(resolveNonNullAncestors(h, 'item', sectionRow).map((a) => a.type)).toEqual([
        'courseSection',
        'course',
        'organization',
      ]);
    });

    it('ignores non-string and empty ids', () => {
      const row = { id: 'i1', projectId: 42, courseSectionId: '', courseId: 'c1', organizationId: 'o1' };
      expect(resolveNonNullAncestors(h, 'item', row).map((a) => a.type)).toEqual(['course', 'organization']);
    });
  });

  describe('resolveDeepestAncestorId', () => {
    it('is the declared parent when present', () => {
      expect(resolveDeepestAncestorId(h, 'item', fullDepthRow)).toBe('p1');
    });

    it('falls through nullable ancestors to the effective home', () => {
      expect(resolveDeepestAncestorId(h, 'item', { ...fullDepthRow, projectId: null })).toBe('s1');
      expect(resolveDeepestAncestorId(h, 'item', { ...fullDepthRow, projectId: null, courseSectionId: null })).toBe(
        'c1',
      );
    });

    it('is null only when every ancestor id is null', () => {
      expect(resolveDeepestAncestorId(h, 'item', { id: 'i1' })).toBeNull();
    });

    it('degrades to the declared parent without nullable ancestors', () => {
      expect(resolveDeepestAncestorId(h, 'task', fullDepthRow)).toBe('p1');
    });
  });

  describe('possibleHomeChannels', () => {
    it('is the ancestor prefix up to the first non-nullable level', () => {
      expect(possibleHomeChannels(h, 'item')).toEqual(['project', 'courseSection', 'course']);
    });

    it('is just the declared parent without nullable ancestors', () => {
      expect(possibleHomeChannels(h, 'task')).toEqual(['project']);
    });
  });
});
