import { describe, expect, it } from 'vitest';
import { createEntityHierarchy, createRoleRegistry } from '../entity-hierarchy';
import { resolveDeepestAncestorId } from '../resolve-row-channel';
import {
  computeAncestorPath,
  computeChannelPath,
  computeProductPath,
  pathHomeId,
  pathSegments,
  pathStartsWith,
} from '../row-path';

/**
 * Synthetic deep hierarchy (projectcampus-shaped), same topology as
 * resolve-row-channel.test.ts: the path rule must stay equivalent to the
 * deepest-non-null-ancestor rule (last segment = effective home).
 */
describe('row-path (materialized id-path rule)', () => {
  const roles = createRoleRegistry(['admin', 'member'] as const);
  const h = createEntityHierarchy(roles)
    .user()
    .channel('organization', { parent: null, roles: roles.all })
    .channel('course', { parent: 'organization', roles: roles.all })
    .channel('courseSection', { parent: 'course', roles: roles.all })
    .channel('project', { parent: 'courseSection', roles: roles.all })
    .product('item', { parent: 'project', nullableAncestors: ['project', 'courseSection', 'course'] })
    .product('task', { parent: 'project' })
    .build();

  const fullDepthRow = {
    id: 'i1',
    projectId: 'p1',
    courseSectionId: 's1',
    courseId: 'c1',
    organizationId: 'o1',
  };

  describe('computeProductPath', () => {
    it('joins non-null ancestors root-first', () => {
      expect(computeProductPath(h, 'item', fullDepthRow)).toBe('o1/c1/s1/p1');
    });

    it('skips null ancestors (variable-depth rows)', () => {
      expect(computeProductPath(h, 'item', { ...fullDepthRow, projectId: null })).toBe('o1/c1/s1');
      expect(computeProductPath(h, 'item', { ...fullDepthRow, courseSectionId: null })).toBe('o1/c1/p1');
      expect(computeProductPath(h, 'item', { id: 'i1', organizationId: 'o1' })).toBe('o1');
    });

    it('is null without the root ancestor id', () => {
      expect(computeProductPath(h, 'item', { id: 'i1', projectId: 'p1' })).toBeNull();
    });

    it('last segment equals resolveDeepestAncestorId for every depth', () => {
      const rows = [
        fullDepthRow,
        { ...fullDepthRow, projectId: null },
        { ...fullDepthRow, projectId: null, courseSectionId: null },
        { id: 'i1', organizationId: 'o1' },
      ];
      for (const row of rows) {
        const path = computeProductPath(h, 'item', row);
        expect(path && pathHomeId(path)).toBe(resolveDeepestAncestorId(h, 'item', row));
      }
    });
  });

  describe('computeChannelPath', () => {
    it('root channel path is its own id', () => {
      expect(computeChannelPath(h, 'organization', { id: 'o1' })).toBe('o1');
    });

    it('appends own id to the ancestor chain', () => {
      expect(computeChannelPath(h, 'course', { id: 'c1', organizationId: 'o1' })).toBe('o1/c1');
      expect(
        computeChannelPath(h, 'project', { id: 'p1', courseSectionId: 's1', courseId: 'c1', organizationId: 'o1' }),
      ).toBe('o1/c1/s1/p1');
    });

    it('skips null intermediate ancestors (org-level project)', () => {
      expect(
        computeChannelPath(h, 'project', { id: 'p1', courseSectionId: null, courseId: null, organizationId: 'o1' }),
      ).toBe('o1/p1');
    });

    it('is null without the root ancestor or own id', () => {
      expect(computeChannelPath(h, 'course', { id: 'c1' })).toBeNull();
      expect(computeChannelPath(h, 'course', { organizationId: 'o1' })).toBeNull();
    });
  });

  describe('computeAncestorPath', () => {
    it('is null for the root channel (no ancestors)', () => {
      expect(computeAncestorPath(h, 'organization', { id: 'o1' })).toBeNull();
    });
  });

  describe('pathStartsWith', () => {
    it('matches itself and true descendants only', () => {
      expect(pathStartsWith('o1/c1/p1', 'o1/c1/p1')).toBe(true);
      expect(pathStartsWith('o1/c1/p1', 'o1/c1')).toBe(true);
      expect(pathStartsWith('o1/c1/p1', 'o1')).toBe(true);
      expect(pathStartsWith('o1/c11', 'o1/c1')).toBe(false);
      expect(pathStartsWith('o1', 'o1/c1')).toBe(false);
    });
  });

  describe('pathSegments / pathHomeId', () => {
    it('splits root-first and picks the deepest', () => {
      expect(pathSegments('o1/c1/p1')).toEqual(['o1', 'c1', 'p1']);
      expect(pathHomeId('o1/c1/p1')).toBe('p1');
      expect(pathHomeId('o1')).toBe('o1');
    });
  });
});
