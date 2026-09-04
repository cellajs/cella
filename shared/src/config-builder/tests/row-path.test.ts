import { describe, expect, it } from 'vitest';
import { deepHierarchy } from '../../testing/deep-fixture.ts';
import { pathHomeId, pathSegments, pathStartsWith } from '../row-path.ts';

/** The path rule stays equivalent to deepest-non-null-ancestor: the last segment is the home. */
describe('row-path (materialized id-path rule)', () => {
  const h = deepHierarchy;

  const fullDepthRow = {
    id: 'i1',
    projectId: 'p1',
    courseSectionId: 's1',
    courseId: 'c1',
    organizationId: 'o1',
  };

  describe('computeProductPath', () => {
    it('joins non-null ancestors root-first', () => {
      expect(h.computeProductPath('item', fullDepthRow)).toBe('o1/c1/s1/p1');
    });

    it('skips null ancestors (variable-depth rows)', () => {
      expect(h.computeProductPath('item', { ...fullDepthRow, projectId: null })).toBe('o1/c1/s1');
      expect(h.computeProductPath('item', { ...fullDepthRow, courseSectionId: null })).toBe('o1/c1/p1');
      expect(h.computeProductPath('item', { id: 'i1', organizationId: 'o1' })).toBe('o1');
    });

    it('is null without the organization id', () => {
      expect(h.computeProductPath('item', { id: 'i1', projectId: 'p1' })).toBeNull();
    });

    it('last segment equals resolveDeepestAncestorId for every depth', () => {
      const rows = [
        fullDepthRow,
        { ...fullDepthRow, projectId: null },
        { ...fullDepthRow, projectId: null, courseSectionId: null },
        { id: 'i1', organizationId: 'o1' },
      ];
      for (const row of rows) {
        const path = h.computeProductPath('item', row);
        expect(path && pathHomeId(path)).toBe(h.resolveDeepestAncestorId('item', row));
      }
    });
  });

  describe('computeChannelPath', () => {
    it('organization path is its own id', () => {
      expect(h.computeChannelPath('organization', { id: 'o1' })).toBe('o1');
    });

    it('appends own id to the ancestor chain', () => {
      expect(h.computeChannelPath('course', { id: 'c1', organizationId: 'o1' })).toBe('o1/c1');
      expect(
        h.computeChannelPath('project', { id: 'p1', courseSectionId: 's1', courseId: 'c1', organizationId: 'o1' }),
      ).toBe('o1/c1/s1/p1');
    });

    it('skips null intermediate ancestors (org-level project)', () => {
      expect(
        h.computeChannelPath('project', { id: 'p1', courseSectionId: null, courseId: null, organizationId: 'o1' }),
      ).toBe('o1/p1');
    });

    it('is null without the organization or own id', () => {
      expect(h.computeChannelPath('course', { id: 'c1' })).toBeNull();
      expect(h.computeChannelPath('course', { organizationId: 'o1' })).toBeNull();
    });
  });

  describe('computeAncestorPath', () => {
    it('is null for the organization (no ancestors)', () => {
      expect(h.computeAncestorPath('organization', { id: 'o1' })).toBeNull();
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
