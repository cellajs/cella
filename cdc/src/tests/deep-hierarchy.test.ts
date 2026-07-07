import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createEntityHierarchy, createRoleRegistry } from 'shared';
import type { InsertActivityModel } from '#/modules/activities/activities-db';
import type { ActivityWithoutId } from '../pipeline/parse-message';
import type { EntityTableMeta } from '../types';
import { computeBatchUnifiedDeltas, resolveContextKey } from '../utils/compute-unified-deltas';
import { getCountDeltas } from '../utils/update-counts';
import { log } from '../lib/pino';

const roles = createRoleRegistry(['admin', 'member'] as const);
const h = createEntityHierarchy(roles)
  .user()
  .context('organization', { parent: null, roles: roles.all })
  .context('course', { parent: 'organization', roles: roles.all })
  .context('courseSection', { parent: 'course', roles: roles.all })
  .context('project', { parent: 'courseSection', roles: roles.all })
  .product('item', { parent: 'project', nullableAncestors: ['project', 'courseSection'] })
  .build();

const itemMeta = (): EntityTableMeta =>
  ({ kind: 'entity', type: 'item', table: { [Symbol.for('drizzle:Name')]: 'items' } }) as unknown as EntityTableMeta;

const itemActivity = (action: string, organizationId: string | null = 'o1'): InsertActivityModel =>
  ({ action, entityType: 'item', organizationId }) as unknown as InsertActivityModel;

/** Item attached at full depth: lives in a project. */
const fullDepthRow = {
  id: 'i1',
  projectId: 'p1',
  courseSectionId: 's1',
  courseId: 'c1',
  organizationId: 'o1',
  deletedAt: null,
};
/** Item attached to a course section (no project). */
const sectionRow = { ...fullDepthRow, projectId: null };
/** Course-stream item: lives directly on the course. */
const courseStreamRow = { ...fullDepthRow, projectId: null, courseSectionId: null };

const mockEvent = (
  action: string,
  rowData: Record<string, unknown> & { id: string },
  oldRowData: (Record<string, unknown> & { id: string }) | null = null,
  organizationId: string | null = 'o1',
) => ({
  lsn: `0/${rowData.id}`,
  result: {
    activity: itemActivity(action, organizationId),
    rowData,
    oldRowData,
    tableMeta: itemMeta(),
  },
});

beforeEach(() => {
  vi.mocked(log.warn).mockClear();
});

// Deepest-non-null-ancestor attribution on a synthetic 4-level hierarchy (organization >
// course > courseSection > project) where an `item` product attaches at any depth. raak/cella
// hierarchies use NOT NULL ancestor columns, so this degrades to the declared parent there.

// ── Seq scope ────────────────────────────────────────────────────────────────

describe('seq scope: deepest non-null ancestor (resolveContextKey)', () => {
  const activity = (organizationId: string | null = 'o1') =>
    ({ organizationId }) as unknown as ActivityWithoutId;

  it('full-depth row scopes to its project', () => {
    expect(resolveContextKey('item', fullDepthRow, activity(), h)).toBe('p1');
  });

  it('section-level row falls through the null project to its section', () => {
    expect(resolveContextKey('item', sectionRow, activity(), h)).toBe('s1');
  });

  it('course-stream row scopes to its course', () => {
    expect(resolveContextKey('item', courseStreamRow, activity(), h)).toBe('c1');
  });

  it('falls back to the activity org when the row has no ancestor ids', () => {
    expect(resolveContextKey('item', { id: 'i1' }, activity(), h)).toBe('o1');
  });

  it('falls back to public:{type} when there is no context at all', () => {
    expect(resolveContextKey('item', { id: 'i1' }, activity(null), h)).toBe('public:item');
  });
});

describe('seq groups per effective home (computeBatchUnifiedDeltas)', () => {
  it('groups variable-depth rows under their own contexts, with org signals', () => {
    const plan = computeBatchUnifiedDeltas(
      [mockEvent('create', fullDepthRow), mockEvent('create', { ...courseStreamRow, id: 'i2' })],
      h,
    );

    expect(plan.seqGroups).toHaveLength(2);
    const byCtx = new Map(plan.seqGroups.map((g) => [g.contextKey, g]));
    expect(byCtx.get('p1')).toMatchObject({ seqKey: 's:item', count: 1, orgSignal: { orgKey: 'o1' } });
    expect(byCtx.get('c1')).toMatchObject({ seqKey: 's:item', count: 1, orgSignal: { orgKey: 'o1' } });
  });

  it('same-context rows share one group and seq range', () => {
    const plan = computeBatchUnifiedDeltas(
      [mockEvent('create', fullDepthRow), mockEvent('create', { ...fullDepthRow, id: 'i2' })],
      h,
    );
    expect(plan.seqGroups).toHaveLength(1);
    expect(plan.seqGroups[0]).toMatchObject({ contextKey: 'p1', count: 2 });
  });

  it('a contextless row lands in the public:{type} scope with no org signal', () => {
    const plan = computeBatchUnifiedDeltas([mockEvent('create', { id: 'i1' }, null, null)], h);
    expect(plan.seqGroups).toHaveLength(1);
    expect(plan.seqGroups[0]).toMatchObject({ contextKey: 'public:item', orgSignal: null });
  });
});

// ── Counters ─────────────────────────────────────────────────────────────────

describe('counter attribution: org + every non-null ancestor (getCountDeltas)', () => {
  it('full-depth create bumps org, course, section AND project', () => {
    const deltas = getCountDeltas(itemMeta(), itemActivity('create'), fullDepthRow, null, h);
    expect(deltas).toEqual(
      expect.arrayContaining([
        { contextKey: 'o1', deltas: { 'e:item': 1 } },
        { contextKey: 'p1', deltas: { 'e:item': 1 } },
        { contextKey: 's1', deltas: { 'e:item': 1 } },
        { contextKey: 'c1', deltas: { 'e:item': 1 } },
      ]),
    );
    expect(deltas).toHaveLength(4);
  });

  it('course-stream create bumps only org and course', () => {
    const deltas = getCountDeltas(itemMeta(), itemActivity('create'), courseStreamRow, null, h);
    expect(deltas).toEqual(
      expect.arrayContaining([
        { contextKey: 'o1', deltas: { 'e:item': 1 } },
        { contextKey: 'c1', deltas: { 'e:item': 1 } },
      ]),
    );
    expect(deltas).toHaveLength(2);
  });

  it('hard delete decrements from the old row', () => {
    const deltas = getCountDeltas(itemMeta(), itemActivity('delete'), { id: 'i1' }, sectionRow, h);
    expect(deltas).toEqual(
      expect.arrayContaining([
        { contextKey: 'o1', deltas: { 'e:item': -1 } },
        { contextKey: 's1', deltas: { 'e:item': -1 } },
        { contextKey: 'c1', deltas: { 'e:item': -1 } },
      ]),
    );
    expect(deltas).toHaveLength(3);
  });

  it('batch merge: two rows at different depths accumulate per context', () => {
    const plan = computeBatchUnifiedDeltas(
      [mockEvent('create', fullDepthRow), mockEvent('create', { ...courseStreamRow, id: 'i2' })],
      h,
    );
    expect(plan.countDeltasByContextKey.get('o1')).toEqual({ 'e:item': 2 });
    expect(plan.countDeltasByContextKey.get('c1')).toEqual({ 'e:item': 2 });
    expect(plan.countDeltasByContextKey.get('s1')).toEqual({ 'e:item': 1 });
    expect(plan.countDeltasByContextKey.get('p1')).toEqual({ 'e:item': 1 });
  });
});

describe('reparent updates re-credit the ancestor diff', () => {
  it('project→project move (same course): only the projects change', () => {
    const deltas = getCountDeltas(itemMeta(), itemActivity('update'), { ...fullDepthRow, projectId: 'p2' }, fullDepthRow, h);
    expect(deltas).toEqual(
      expect.arrayContaining([
        { contextKey: 'p2', deltas: { 'e:item': 1 } },
        { contextKey: 'p1', deltas: { 'e:item': -1 } },
      ]),
    );
    expect(deltas).toHaveLength(2);
  });

  it('re-attach deeper (section → project): only the project is credited', () => {
    const deltas = getCountDeltas(itemMeta(), itemActivity('update'), fullDepthRow, sectionRow, h);
    expect(deltas).toEqual([{ contextKey: 'p1', deltas: { 'e:item': 1 } }]);
  });

  it('cross-course move re-credits the whole differing chain, org untouched', () => {
    const moved = { ...fullDepthRow, projectId: 'p2', courseSectionId: 's2', courseId: 'c2' };
    const deltas = getCountDeltas(itemMeta(), itemActivity('update'), moved, fullDepthRow, h);
    expect(deltas).toEqual(
      expect.arrayContaining([
        { contextKey: 'p2', deltas: { 'e:item': 1 } },
        { contextKey: 's2', deltas: { 'e:item': 1 } },
        { contextKey: 'c2', deltas: { 'e:item': 1 } },
        { contextKey: 'p1', deltas: { 'e:item': -1 } },
        { contextKey: 's1', deltas: { 'e:item': -1 } },
        { contextKey: 'c1', deltas: { 'e:item': -1 } },
      ]),
    );
    expect(deltas).toHaveLength(6);
  });

  it('no ancestor change → no deltas', () => {
    const deltas = getCountDeltas(itemMeta(), itemActivity('update'), fullDepthRow, fullDepthRow, h);
    expect(deltas).toEqual([]);
  });

  it('reparent while soft-deleted → no deltas (row is not counted anywhere)', () => {
    const trashed = { ...fullDepthRow, deletedAt: '2026-07-07T12:00:00Z' };
    const deltas = getCountDeltas(itemMeta(), itemActivity('update'), { ...trashed, projectId: 'p2' }, trashed, h);
    expect(deltas).toEqual([]);
  });
});

describe('soft-delete / restore transitions on variable-depth rows', () => {
  it('soft-delete of a course-stream item decrements exactly its non-null ancestors', () => {
    const deltas = getCountDeltas(
      itemMeta(),
      itemActivity('update'),
      { ...courseStreamRow, deletedAt: '2026-07-07T12:00:00Z' },
      courseStreamRow,
      h,
    );
    expect(deltas).toEqual(
      expect.arrayContaining([
        { contextKey: 'o1', deltas: { 'e:item': -1 } },
        { contextKey: 'c1', deltas: { 'e:item': -1 } },
      ]),
    );
    expect(deltas).toHaveLength(2);
  });

  it('restore counts the row again on the same set', () => {
    const deltas = getCountDeltas(
      itemMeta(),
      itemActivity('update'),
      courseStreamRow,
      { ...courseStreamRow, deletedAt: '2026-07-07T12:00:00Z' },
      h,
    );
    expect(deltas).toEqual(
      expect.arrayContaining([
        { contextKey: 'o1', deltas: { 'e:item': 1 } },
        { contextKey: 'c1', deltas: { 'e:item': 1 } },
      ]),
    );
    expect(deltas).toHaveLength(2);
  });
});

// ── Nullable-ancestor warnings ───────────────────────────────────────────────

describe('missing-ancestor warnings respect nullableAncestors', () => {
  it('a variable-depth row with only nullable ancestors missing warns nothing', () => {
    getCountDeltas(itemMeta(), itemActivity('create'), courseStreamRow, null, h);
    expect(log.warn).not.toHaveBeenCalled();
  });

  it('a missing non-nullable ancestor still warns', () => {
    getCountDeltas(itemMeta(), itemActivity('create'), { ...courseStreamRow, courseId: null }, null, h);
    expect(log.warn).toHaveBeenCalledWith(expect.stringContaining('courseId'), expect.anything());
  });
});
