import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeDeepHierarchy } from 'shared/testing/deep-fixture';
import type { InsertActivityModel } from '#/modules/activities/activities-db';
import type { ActivityWithoutId } from '../pipeline/parse-message';
import type { EntityTableMeta } from '../types';
import { computeBatchUnifiedDeltas, frontierNodeKeys, resolveChannelKey } from '../utils/compute-unified-deltas';
import { getCountDeltas } from '../utils/update-counts';
import { log } from '../lib/pino';

// `course` stays non-nullable so the missing-ancestor warning suite below can prove
// that a null non-nullable ancestor still warns.
const h = makeDeepHierarchy(['project', 'courseSection']);

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

describe('home channel: deepest non-null ancestor (resolveChannelKey)', () => {
  const activity = (organizationId: string | null = 'o1') =>
    ({ organizationId }) as unknown as ActivityWithoutId;

  it('full-depth row scopes to its project', () => {
    expect(resolveChannelKey('item', fullDepthRow, activity(), h)).toBe('p1');
  });

  it('section-level row falls through the null project to its section', () => {
    expect(resolveChannelKey('item', sectionRow, activity(), h)).toBe('s1');
  });

  it('course-stream row scopes to its course', () => {
    expect(resolveChannelKey('item', courseStreamRow, activity(), h)).toBe('c1');
  });

  it('falls back to the activity org when the row has no ancestor ids', () => {
    expect(resolveChannelKey('item', { id: 'i1' }, activity(), h)).toBe('o1');
  });

  it('throws when there is no context at all (hierarchy requires an organization)', () => {
    expect(() => resolveChannelKey('item', { id: 'i1' }, activity(null), h)).toThrow(/organization ancestor/);
  });
});

describe('sequence groups per organization (computeBatchUnifiedDeltas)', () => {
  it('variable-depth rows in one org share ONE sequence group (all depths, one order)', () => {
    const plan = computeBatchUnifiedDeltas(
      [mockEvent('create', fullDepthRow), mockEvent('create', { ...courseStreamRow, id: 'i2' })],
      h,
    );

    expect(plan.orgSequenceGroups).toHaveLength(1);
    expect(plan.orgSequenceGroups[0]).toMatchObject({ orgKey: 'o1', count: 2 });
    expect(plan.orgSequenceGroups[0].events).toHaveLength(2);
  });

  it('same-org rows preserve WAL order within the group', () => {
    const plan = computeBatchUnifiedDeltas(
      [mockEvent('create', fullDepthRow), mockEvent('create', { ...fullDepthRow, id: 'i2' })],
      h,
    );
    expect(plan.orgSequenceGroups).toHaveLength(1);
    expect(plan.orgSequenceGroups[0].events.map((e) => e.result.rowData.id)).toEqual(['i1', 'i2']);
  });

  it('frontierNodeKeys rolls a full-depth row up to org + every non-null ancestor', () => {
    expect(frontierNodeKeys('item', fullDepthRow, 'o1', h)).toEqual(['o1', 'p1', 's1', 'c1']);
    expect(frontierNodeKeys('item', courseStreamRow, 'o1', h)).toEqual(['o1', 'c1']);
  });

  it('an org-less row fails the batch loudly instead of inventing a scope', () => {
    expect(() => computeBatchUnifiedDeltas([mockEvent('create', { id: 'i1' }, null, null)], h)).toThrow(/organization ancestor/);
  });
});

// ── Counters ─────────────────────────────────────────────────────────────────

describe('counter attribution: org + every non-null ancestor (getCountDeltas)', () => {
  it('full-depth create bumps org, course, section AND project; stamps the project only', () => {
    const deltas = getCountDeltas(itemMeta(), itemActivity('create'), fullDepthRow, null, h);
    expect(deltas).toEqual(
      expect.arrayContaining([
        { channelKey: 'o1', deltas: { 'e:c:item': 1 } },
        { channelKey: 'p1', deltas: { 'e:c:item': 1 } },
        { channelKey: 's1', deltas: { 'e:c:item': 1 } },
        { channelKey: 'c1', deltas: { 'e:c:item': 1 } },
        // Home-scoped signals stay at the home context and never fan out to higher ancestors.
        { channelKey: 'p1', deltas: { 'e:c:h:item': 1 } },
        { channelKey: 'p1', deltas: { 'e:li:h:item': expect.any(Number) } },
      ]),
    );
    expect(deltas).toHaveLength(6);
  });

  it('course-stream create bumps only org and course; stamps the course', () => {
    const deltas = getCountDeltas(itemMeta(), itemActivity('create'), courseStreamRow, null, h);
    expect(deltas).toEqual(
      expect.arrayContaining([
        { channelKey: 'o1', deltas: { 'e:c:item': 1 } },
        { channelKey: 'c1', deltas: { 'e:c:item': 1 } },
        { channelKey: 'c1', deltas: { 'e:c:h:item': 1 } },
        { channelKey: 'c1', deltas: { 'e:li:h:item': expect.any(Number) } },
      ]),
    );
    expect(deltas).toHaveLength(4);
  });

  it('the stamp carries the row createdAt as epoch ms at the home key', () => {
    const createdAt = '2026-07-01T10:00:00.000Z';
    const deltas = getCountDeltas(itemMeta(), itemActivity('create'), { ...fullDepthRow, createdAt }, null, h);
    expect(deltas).toContainEqual({ channelKey: 'p1', deltas: { 'e:li:h:item': Date.parse(createdAt) } });
    // No stamp anywhere else
    const stamped = deltas.filter((d) => 'e:li:h:item' in d.deltas);
    expect(stamped).toHaveLength(1);
  });

  it('hard delete decrements from the old row', () => {
    const deltas = getCountDeltas(itemMeta(), itemActivity('delete'), { id: 'i1' }, sectionRow, h);
    expect(deltas).toEqual(
      expect.arrayContaining([
        { channelKey: 'o1', deltas: { 'e:c:item': -1 } },
        { channelKey: 's1', deltas: { 'e:c:item': -1 } },
        { channelKey: 'c1', deltas: { 'e:c:item': -1 } },
        // Self count leaves the old home.
        { channelKey: 's1', deltas: { 'e:c:h:item': -1 } },
      ]),
    );
    expect(deltas).toHaveLength(4);
  });

  it('batch merge: two rows at different depths accumulate per context', () => {
    const plan = computeBatchUnifiedDeltas(
      [mockEvent('create', fullDepthRow), mockEvent('create', { ...courseStreamRow, id: 'i2' })],
      h,
    );
    // Activity stamps land at each row's home context only; org and section stay stamp-free
    expect(plan.countDeltasByChannelKey.get('o1')).toEqual({ 'e:c:item': 2 });
    expect(plan.countDeltasByChannelKey.get('c1')).toEqual({ 'e:c:item': 2, 'e:c:h:item': 1, 'e:li:h:item': expect.any(Number) });
    expect(plan.countDeltasByChannelKey.get('s1')).toEqual({ 'e:c:item': 1 });
    expect(plan.countDeltasByChannelKey.get('p1')).toEqual({ 'e:c:item': 1, 'e:c:h:item': 1, 'e:li:h:item': expect.any(Number) });
  });
});

describe('reparent updates re-credit the ancestor diff', () => {
  it('project→project move (same course): only the projects change, lu stamps the new home', () => {
    const deltas = getCountDeltas(itemMeta(), itemActivity('update'), { ...fullDepthRow, projectId: 'p2' }, fullDepthRow, h);
    expect(deltas).toEqual(
      expect.arrayContaining([
        { channelKey: 'p2', deltas: { 'e:c:item': 1 } },
        { channelKey: 'p1', deltas: { 'e:c:item': -1 } },
        // Self count moves between homes.
        { channelKey: 'p1', deltas: { 'e:c:h:item': -1 } },
        { channelKey: 'p2', deltas: { 'e:c:h:item': 1 } },
        { channelKey: 'p2', deltas: { 'e:lu:h:item': expect.any(Number) } },
      ]),
    );
    expect(deltas).toHaveLength(5);
  });

  it('re-attach deeper (section → project): only the project is credited', () => {
    const deltas = getCountDeltas(itemMeta(), itemActivity('update'), fullDepthRow, sectionRow, h);
    expect(deltas).toEqual([
      { channelKey: 'p1', deltas: { 'e:c:item': 1 } },
      // Home moved section → project: self count follows.
      { channelKey: 's1', deltas: { 'e:c:h:item': -1 } },
      { channelKey: 'p1', deltas: { 'e:c:h:item': 1 } },
      { channelKey: 'p1', deltas: { 'e:lu:h:item': expect.any(Number) } },
    ]);
  });

  it('cross-course move re-credits the whole differing chain, org untouched', () => {
    const moved = { ...fullDepthRow, projectId: 'p2', courseSectionId: 's2', courseId: 'c2' };
    const deltas = getCountDeltas(itemMeta(), itemActivity('update'), moved, fullDepthRow, h);
    expect(deltas).toEqual(
      expect.arrayContaining([
        { channelKey: 'p2', deltas: { 'e:c:item': 1 } },
        { channelKey: 's2', deltas: { 'e:c:item': 1 } },
        { channelKey: 'c2', deltas: { 'e:c:item': 1 } },
        { channelKey: 'p1', deltas: { 'e:c:item': -1 } },
        { channelKey: 's1', deltas: { 'e:c:item': -1 } },
        { channelKey: 'c1', deltas: { 'e:c:item': -1 } },
        { channelKey: 'p1', deltas: { 'e:c:h:item': -1 } },
        { channelKey: 'p2', deltas: { 'e:c:h:item': 1 } },
        { channelKey: 'p2', deltas: { 'e:lu:h:item': expect.any(Number) } },
      ]),
    );
    expect(deltas).toHaveLength(9);
  });

  it('no ancestor change → only the lu stamp at the home context', () => {
    const deltas = getCountDeltas(itemMeta(), itemActivity('update'), fullDepthRow, fullDepthRow, h);
    expect(deltas).toEqual([{ channelKey: 'p1', deltas: { 'e:lu:h:item': expect.any(Number) } }]);
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
        { channelKey: 'o1', deltas: { 'e:c:item': -1 } },
        { channelKey: 'c1', deltas: { 'e:c:item': -1 } },
        { channelKey: 'c1', deltas: { 'e:c:h:item': -1 } },
      ]),
    );
    expect(deltas).toHaveLength(3);
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
        { channelKey: 'o1', deltas: { 'e:c:item': 1 } },
        { channelKey: 'c1', deltas: { 'e:c:item': 1 } },
        { channelKey: 'c1', deltas: { 'e:c:h:item': 1 } },
      ]),
    );
    expect(deltas).toHaveLength(3);
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
