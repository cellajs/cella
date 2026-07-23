import { describe, expect, it } from 'vitest';
import { makeDeepHierarchy } from '../../testing/deep-fixture';

/**
 * Variable-depth `item` rows attach at any depth; raak/cella configs cannot exhibit this
 * (no nullable ancestors), so the rule is proven on the deep fixture. `course` stays
 * non-nullable here so possibleHomeChannels can prove its first-non-nullable boundary.
 */
describe('resolve-row-channel (deepest non-null ancestor rule)', () => {
  const h = makeDeepHierarchy(['project', 'courseSection']);

  const fullDepthRow = {
    id: 'i1',
    projectId: 'p1',
    courseSectionId: 's1',
    courseId: 'c1',
    organizationId: 'o1',
  };

  describe('resolveNonNullAncestors', () => {
    it('returns all non-null ancestors most-specific first', () => {
      expect(h.resolveNonNullAncestors('item', fullDepthRow)).toEqual([
        { type: 'project', idColumn: 'projectId', id: 'p1' },
        { type: 'courseSection', idColumn: 'courseSectionId', id: 's1' },
        { type: 'course', idColumn: 'courseId', id: 'c1' },
        { type: 'organization', idColumn: 'organizationId', id: 'o1' },
      ]);
    });

    it('skips null ancestor ids (variable-depth row)', () => {
      const sectionRow = { ...fullDepthRow, projectId: null };
      expect(h.resolveNonNullAncestors('item', sectionRow).map((a) => a.type)).toEqual([
        'courseSection',
        'course',
        'organization',
      ]);
    });

    it('ignores non-string and empty ids', () => {
      const row = { id: 'i1', projectId: 42, courseSectionId: '', courseId: 'c1', organizationId: 'o1' };
      expect(h.resolveNonNullAncestors('item', row).map((a) => a.type)).toEqual(['course', 'organization']);
    });
  });

  describe('resolveDeepestAncestorId', () => {
    it('is the declared parent when present', () => {
      expect(h.resolveDeepestAncestorId('item', fullDepthRow)).toBe('p1');
    });

    it('falls through nullable ancestors to the effective home', () => {
      expect(h.resolveDeepestAncestorId('item', { ...fullDepthRow, projectId: null })).toBe('s1');
      expect(h.resolveDeepestAncestorId('item', { ...fullDepthRow, projectId: null, courseSectionId: null })).toBe(
        'c1',
      );
    });

    it('is null only when every ancestor id is null', () => {
      expect(h.resolveDeepestAncestorId('item', { id: 'i1' })).toBeNull();
    });

    it('degrades to the declared parent without nullable ancestors', () => {
      expect(h.resolveDeepestAncestorId('task', fullDepthRow)).toBe('p1');
    });
  });

  describe('possibleHomeChannels', () => {
    it('is the ancestor prefix up to the first non-nullable level', () => {
      expect(h.possibleHomeChannels('item')).toEqual(['project', 'courseSection', 'course']);
    });

    it('is just the declared parent without nullable ancestors', () => {
      expect(h.possibleHomeChannels('task')).toEqual(['project']);
    });
  });
});
