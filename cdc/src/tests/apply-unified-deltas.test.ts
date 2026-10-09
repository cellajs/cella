import { createEntityHierarchy, createRoleRegistry } from 'shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DeltaExecutor } from '../utils/apply-unified-deltas';
import type { BatchUnifiedDeltaPlan } from '../utils/compute-unified-deltas';
import { changeEvent, tableMetaOf } from './factories';

interface DbOp {
  type: 'upsert' | 'execute';
  sql?: string;
}

const dbOps: DbOp[] = [];
let upsertReturnValue: Record<string, number> = {};

/** Stands in for the flush's transaction: records each statement as a counter upsert or another one. */
const db = {
  execute: vi.fn(async (query: any) => {
    const chunks = query?.queryChunks ?? [];
    const sqlParts = chunks.map((c: any) => c?.value?.[0] ?? String(c ?? '')).join('');
    dbOps.push(sqlParts.includes('channel_counters') ? { type: 'upsert' } : { type: 'execute', sql: sqlParts });
    return { rows: [{ counts: upsertReturnValue }], rowCount: 1 };
  }),
} as unknown as DeltaExecutor;

const { applyBatchUnifiedDeltas } = await import('../utils/apply-unified-deltas');
const { frontierNodeKeys, mergeDelta } = await import('../utils/compute-unified-deltas');

// Synthetic two-level hierarchy: org > project > task (cella's own config has no sub-org product)
const roles = createRoleRegistry(['admin', 'member'] as const);
const syntheticH = createEntityHierarchy(roles)
  .user()
  .organization({ roles: roles.all })
  .channel('project', { parent: 'organization', roles: roles.all })
  .product('task', { parent: 'project' })
  .build();

beforeEach(() => {
  dbOps.length = 0;
  upsertReturnValue = {};
});

describe('applyBatchUnifiedDeltas', () => {
  const mockEvent = (id: string) =>
    changeEvent({ tableMeta: tableMetaOf('entity', 'task'), action: 'create', rowData: { id, projectId: 'proj-1', organizationId: 'org-1' } });

  it('assigns sequential org-sequence values to events from the reserved range', async () => {
    upsertReturnValue = { sequence: 5 }; // highSeq = 5, count = 3, baseSeq = 2

    const events = [mockEvent('t1'), mockEvent('t2'), mockEvent('t3')];

    const plan: BatchUnifiedDeltaPlan = {
      orgSequenceGroups: [{ orgKey: 'org-1', count: 3, events }],
      countDeltasByChannelKey: new Map([
        ['org-1', { 'e:c:task': 3 }],
        ['proj-1', { 'e:c:task': 3 }],
      ]),
    };

    await applyBatchUnifiedDeltas(plan, db, syntheticH);

    // Sequential seq values: 3, 4, 5.
    expect(events[0].result.rowData.seq).toBe(3);
    expect(events[1].result.rowData.seq).toBe(4);
    expect(events[2].result.rowData.seq).toBe(5);
  });

  it('phase 1 merges sequence + org counts; phase 2 writes frontier nodes and the stamp-back', async () => {
    upsertReturnValue = { sequence: 2, 'e:c:task': 2 };

    const events = [mockEvent('t1'), mockEvent('t2')];

    const plan: BatchUnifiedDeltaPlan = {
      orgSequenceGroups: [{ orgKey: 'org-1', count: 2, events }],
      countDeltasByChannelKey: new Map([
        ['org-1', { 'e:c:task': 2 }],
        ['proj-1', { 'e:c:task': 2 }],
      ]),
    };

    await applyBatchUnifiedDeltas(plan, db, syntheticH);

    // Phase-1 org reservation, phase-2 org frontier, phase-2 proj-1 counts + frontier.
    const upserts = dbOps.filter((op) => op.type === 'upsert');
    expect(upserts).toHaveLength(3);
    // Per table: the rows are locked in id order, then stamped by one bulk UPDATE.
    const executes = dbOps.filter((op) => op.type === 'execute');
    expect(executes).toHaveLength(2);
    expect(executes[0].sql).toContain('FOR NO KEY UPDATE');
    expect(executes[1].sql).toContain('UPDATE');
  });

  it('every stamped event bumps frontiers: tombstones of published rows included', async () => {
    // Drafts never reach apply: the publication row filter and the parse-message guard remove them,
    // so whatever is stamped here is delta-fetchable and bumps the frontier.
    upsertReturnValue = { sequence: 2 };

    const tombstoneEvent = (id: string) => {
      const event = mockEvent(id);
      (event.result.rowData as Record<string, unknown>).deletedAt = '2026-07-05T10:00:00.000Z';
      return event;
    };
    const events = [mockEvent('t1'), tombstoneEvent('t2')];

    const plan: BatchUnifiedDeltaPlan = {
      orgSequenceGroups: [{ orgKey: 'org-1', count: 2, events }],
      countDeltasByChannelKey: new Map(),
    };

    await applyBatchUnifiedDeltas(plan, db, syntheticH);

    expect(events[0].result.rowData.seq).toBe(1);
    expect(events[1].result.rowData.seq).toBe(2);
    // Phase-1 org reservation + phase-2 frontier writes (org + proj-1); both events bump.
    expect(dbOps.filter((op) => op.type === 'upsert')).toHaveLength(3);
    expect(dbOps.filter((op) => op.type === 'execute')).toHaveLength(2);
  });

  it('stamps a row that changed twice in one flush once, with its last position', async () => {
    upsertReturnValue = { sequence: 3 };
    const events = [mockEvent('t1'), mockEvent('t2'), mockEvent('t1')];

    await applyBatchUnifiedDeltas({ orgSequenceGroups: [{ orgKey: 'org-1', count: 3, events }], countDeltasByChannelKey: new Map() }, db, syntheticH);

    // Each event keeps the position it was given, for its notification.
    expect(events.map((event) => event.result.rowData.seq)).toEqual([1, 2, 3]);
    const stamp = vi.mocked(db.execute).mock.calls.at(-1)?.[0] as unknown as { queryChunks: unknown[] };
    const params = JSON.stringify(stamp.queryChunks);
    expect(params.match(/"t1"/g)).toHaveLength(1);
    expect(params.match(/"t2"/g)).toHaveLength(1);
  });

  it('handles empty plan', async () => {
    const plan: BatchUnifiedDeltaPlan = { orgSequenceGroups: [], countDeltasByChannelKey: new Map() };

    await applyBatchUnifiedDeltas(plan, db, syntheticH);
    expect(dbOps).toHaveLength(0);
  });
});

describe('frontierNodeKeys', () => {
  it('org first, then every non-null ancestor, deduplicated', () => {
    expect(frontierNodeKeys('task', { id: 't1', projectId: 'proj-1', organizationId: 'org-1' }, 'org-1', syntheticH)).toEqual(['org-1', 'proj-1']);
  });

  it('org-homed row rolls up to the org node only', () => {
    expect(frontierNodeKeys('task', { id: 't1', organizationId: 'org-1' }, 'org-1', syntheticH)).toEqual(['org-1']);
  });
});

describe('mergeDelta', () => {
  /** Merges `deltas` into what channel `org-1` holds, and returns the result. */
  const merged = (held: Record<string, number>, ...deltas: Record<string, number>[]) => {
    const map = new Map([['org-1', held]]);
    for (const delta of deltas) mergeDelta(map, 'org-1', delta);
    return map.get('org-1');
  };

  it('adds a count to the one a channel already holds', () => {
    expect(merged({ membership: 2, 'e:c:task': 1 }, { 'e:c:task': 2, 'm:c:admin': 1 })).toEqual({ membership: 2, 'e:c:task': 3, 'm:c:admin': 1 });
  });

  it('must not add up activity stamps: the later one stays', () => {
    const held = { 'e:li:h:task': 1_751_000_000_000, 'e:lu:h:task': 1_751_000_000_000 };

    expect(merged({ ...held }, { 'e:li:h:task': 1_750_000_000_000, 'e:lu:h:task': 1_750_000_000_000 })).toEqual(held);
    expect(merged({ ...held }, { 'e:li:h:task': 1_752_000_000_000, 'e:lu:h:task': 1_753_000_000_000 })).toEqual({
      'e:li:h:task': 1_752_000_000_000,
      'e:lu:h:task': 1_753_000_000_000,
    });
  });

  it('must not add up frontiers or set one back: the highest stays', () => {
    expect(merged({ 'e:f:task': 40 }, { 'e:f:task': 35 })).toEqual({ 'e:f:task': 40 });
    expect(merged({ 'e:f:task': 40 }, { 'e:f:task': 35 }, { 'e:f:task': 41 })).toEqual({ 'e:f:task': 41 });
  });

  it('takes a key the channel does not hold yet as it is', () => {
    expect(merged({ membership: 1 }, { 'e:li:h:task': 1_751_000_000_000, 'e:f:task': 7, 'e:c:task': 1 })).toEqual({
      membership: 1,
      'e:li:h:task': 1_751_000_000_000,
      'e:f:task': 7,
      'e:c:task': 1,
    });
  });

  it('starts a channel it has no deltas for with a copy, so the caller keeps its own object', () => {
    const map = new Map<string, Record<string, number>>();
    const first = { 'e:c:task': 1 };
    mergeDelta(map, 'org-1', first);
    mergeDelta(map, 'org-1', { 'e:c:task': 1 });

    expect(map.get('org-1')).toEqual({ 'e:c:task': 2 });
    expect(first).toEqual({ 'e:c:task': 1 });
  });
});
