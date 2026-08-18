import type { ProductEntityType } from 'shared';
import { describe, expect, it, vi } from 'vitest';

// Deep synthetic hierarchy: `item` attaches at any depth via nullableAncestors, so its home is the deepest non-null ancestor.
vi.mock('shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('shared')>();
  const { deepHierarchy } = await import('shared/testing/deep-fixture');
  return {
    ...actual,
    appConfig: {
      ...actual.appConfig,
      seenTrackedProductTypes: ['item'],
      entityIdColumnKeys: deepHierarchy.idColumnKeys,
    },
    hierarchy: deepHierarchy,
  };
});

const { getSeenChannelId } = await import('./helpers');

const item = 'item' as ProductEntityType;

describe('getSeenChannelId', () => {
  it('resolves the declared parent id when present', () => {
    const row = { organizationId: 'org-1', courseId: 'course-1', courseSectionId: 'section-1', projectId: 'project-1' };
    expect(getSeenChannelId(item, row)).toBe('project-1');
  });

  it('resolves the deepest non-null ancestor when the declared parent is null', () => {
    const atSection = { organizationId: 'org-1', courseId: 'course-1', courseSectionId: 'section-1', projectId: null };
    expect(getSeenChannelId(item, atSection)).toBe('section-1');

    const atCourse = { organizationId: 'org-1', courseId: 'course-1', courseSectionId: null, projectId: null };
    expect(getSeenChannelId(item, atCourse)).toBe('course-1');
  });

  it('matches mark-seen/unseen-sync grouping for org-attached rows', () => {
    const row = { organizationId: 'org-1', courseId: null, courseSectionId: null, projectId: null };
    expect(getSeenChannelId(item, row)).toBe('org-1');
  });

  it('returns a string even when resolution falls through to organizationId', () => {
    // SeenMark falls back via `channelId ?? organizationId`; a null return would defeat it.
    const row = { organizationId: 'org-1' };
    expect(getSeenChannelId(item, row)).toBe('org-1');
    expect(typeof getSeenChannelId(item, row)).toBe('string');
  });
});
