import { deepHierarchy } from 'shared/testing/deep-fixture';
import type { SlotToolsConfig, ToolsConfig } from 'shared/tools-config';
import { describe, expect, it } from 'vitest';
import { ancestorIdsToRead, inheritedLayer } from '#/modules/entities/inherited-tools-config';

// Two projects under one section and one under another, every section in one course of one organization.
const rows = [
  { id: 'p1', organizationId: 'o1', courseId: 'c1', courseSectionId: 's1' },
  { id: 'p2', organizationId: 'o1', courseId: 'c1', courseSectionId: 's1' },
  { id: 'p3', organizationId: 'o1', courseId: 'c1', courseSectionId: 's2' },
];

describe('ancestorIdsToRead', () => {
  it('reads each ancestor the rows name once, and none the request already holds', () => {
    const known = new Map<string, ToolsConfig>([['o1', {}]]);
    expect(Object.fromEntries(ancestorIdsToRead('project', rows, known, deepHierarchy))).toEqual({ courseSection: ['s1', 's2'], course: ['c1'] });
  });

  it('reads the organizations too where no guard resolved one, and nothing for a row without ancestors', () => {
    expect(Object.fromEntries(ancestorIdsToRead('course', [{ id: 'c1', organizationId: 'o1' }], new Map(), deepHierarchy))).toEqual({
      organization: ['o1'],
    });
    expect(ancestorIdsToRead('organization', [{ id: 'o1' }], new Map(), deepHierarchy).size).toBe(0);
  });
});

// Cast: `ToolsConfig` is keyed by the app's channel slots; the deep vocabulary's slots stand in for them.
const stored = (config: Record<string, SlotToolsConfig>) => config as ToolsConfig;

describe('inheritedLayer', () => {
  const configs = new Map([
    ['o1', stored({ 'project.tabs': { order: ['members', 'board'], hidden: ['attachments'] }, 'organization.tabs': { hidden: ['members'] } })],
    ['c1', stored({ 'project.tabs': { hidden: ['board'] }, 'courseSection.tabs': { hidden: ['members'] } })],
    ['s1', stored({ 'project.tabs': { order: ['board'] }, 'project.settings': { hidden: ['archive'] } })],
  ]);

  it("stacks the ancestors' arrangements of the row's slots organization first, and leaves out their own pages", () => {
    expect(inheritedLayer('project', rows[0], configs, deepHierarchy)).toEqual({
      'project.settings': { order: [], hidden: ['archive'] },
      'project.tabs': { order: ['board', 'members'], hidden: ['attachments', 'board'] },
    });
  });

  it('carries the slots below the row too, and skips an ancestor it could not read', () => {
    expect(inheritedLayer('courseSection', { id: 's9', organizationId: 'o1', courseId: 'c9' }, configs, deepHierarchy)).toEqual({
      'project.tabs': { order: ['members', 'board'], hidden: ['attachments'] },
    });
  });
});
