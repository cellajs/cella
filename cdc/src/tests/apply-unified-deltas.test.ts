import { createEntityHierarchy, createRoleRegistry } from 'shared';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { BatchUnifiedDeltaPlan } from '../utils/compute-unified-deltas';
import type { ParseMessageResult } from '../pipeline/parse-message';
import type { InsertActivityModel } from '#/modules/activities/activities-db';
import type { EntityTableMeta } from '../types';

// Track all DB operations for assertions
interface DbOp {
  type: 'upsert' | 'execute';
  sql?: string;
}

const dbOps: DbOp[] = [];
let upsertReturnValue: Record<string, number> = {};

// Mock cdcDb before importing the module under test
vi.mock('../lib/db', () => {
  const mockExecute = vi.fn(async (query: any) => {
    // Detect query type from the SQL template chunks
    const chunks = query?.queryChunks ?? [];
    const sqlParts = chunks.map((c: any) => c?.value?.[0] ?? String(c ?? '')).join('');
    const isCounterUpsert = sqlParts.includes('channel_counters');

    if (isCounterUpsert) {
      dbOps.push({ type: 'upsert' });
    } else {
      dbOps.push({ type: 'execute', sql: 'raw-sql' });
    }

    return { rows: [{ counts: upsertReturnValue }], rowCount: 1 };
  });

  return {
    cdcDb: {
      execute: mockExecute,
    },
  };
});

// Import after mocks are set up
const { applyBatchUnifiedDeltas, sumInto } = await import('../utils/apply-unified-deltas');
const { frontierNodeKeys } = await import('../utils/compute-unified-deltas');

// Synthetic two-level hierarchy: org > project > task (cella's own config has no sub-org product)
const roles = createRoleRegistry(['admin', 'member'] as const);
const syntheticH = createEntityHierarchy(roles)
  .user()
  .channel('organization', { parent: null, roles: roles.all })
  .channel('project', { parent: 'organization', roles: roles.all })
  .product('task', { parent: 'project' })
  .build();

beforeEach(() => {
  dbOps.length = 0;
  upsertReturnValue = {};
});

describe('applyBatchUnifiedDeltas', () => {
  function mockEvent(id: string): { lsn: string; result: ParseMessageResult } {
    return {
      lsn: `0/${id}`,
      result: {
        activity: { action: 'create', entityType: 'task', organizationId: 'org-1' } as unknown as InsertActivityModel,
        rowData: { id, projectId: 'proj-1', organizationId: 'org-1' },
        oldRowData: null,
        tableMeta: {
          kind: 'entity',
          type: 'task',
          table: { [Symbol.for('drizzle:Name')]: 'tasks' },
        } as unknown as EntityTableMeta,
      },
    };
  }

  it('assigns sequential org-ledger values to events from the reserved range', async () => {
    upsertReturnValue = { 's:ledger': 5 }; // highSeq = 5, count = 3, baseSeq = 2

    const events = [mockEvent('t1'), mockEvent('t2'), mockEvent('t3')];

    const plan: BatchUnifiedDeltaPlan = {
      ledgerGroups: [{ orgKey: 'org-1', count: 3, events }],
      countDeltasByChannelKey: new Map([
        ['org-1', { 'e:task': 3 }],
        ['proj-1', { 'e:task': 3 }],
      ]),
    };

    await applyBatchUnifiedDeltas(plan, syntheticH);

    // Events should have sequential ledger values: 3, 4, 5
    expect(events[0].result.rowData.seq).toBe(3);
    expect(events[1].result.rowData.seq).toBe(4);
    expect(events[2].result.rowData.seq).toBe(5);
  });

  it('phase 1 merges ledger + org counts; phase 2 writes frontier nodes and the stamp-back', async () => {
    upsertReturnValue = { 's:ledger': 2, 'e:task': 2 };

    const events = [mockEvent('t1'), mockEvent('t2')];

    const plan: BatchUnifiedDeltaPlan = {
      ledgerGroups: [{ orgKey: 'org-1', count: 2, events }],
      countDeltasByChannelKey: new Map([
        ['org-1', { 'e:task': 2 }],
        ['proj-1', { 'e:task': 2 }],
      ]),
    };

    await applyBatchUnifiedDeltas(plan, syntheticH);

    // Upserts: phase-1 org reservation, phase-2 org frontier, phase-2 proj-1 (counts + frontier)
    const upserts = dbOps.filter((op) => op.type === 'upsert');
    expect(upserts).toHaveLength(3);
    // Stamp-back: one bulk UPDATE for the tasks table
    const executes = dbOps.filter((op) => op.type === 'execute');
    expect(executes).toHaveLength(1);
  });

  it('drafts take ledger stamps but never bump frontier rollups', async () => {
    upsertReturnValue = { 's:ledger': 2 };

    const draftEvent = (id: string) => {
      const event = mockEvent(id);
      (event.result.rowData as Record<string, unknown>).publishedAt = null;
      return event;
    };
    const events = [draftEvent('d1'), draftEvent('d2')];

    const plan: BatchUnifiedDeltaPlan = {
      ledgerGroups: [{ orgKey: 'org-1', count: 2, events }],
      countDeltasByChannelKey: new Map(),
    };

    await applyBatchUnifiedDeltas(plan, syntheticH);

    // Stamps assigned (drafts keep create-time ledger values for their publish edge)...
    expect(events[0].result.rowData.seq).toBe(1);
    expect(events[1].result.rowData.seq).toBe(2);
    // ...but the ONLY counter upsert is the phase-1 org reservation: no frontier writes.
    expect(dbOps.filter((op) => op.type === 'upsert')).toHaveLength(1);
    // Stamp-back still runs.
    expect(dbOps.filter((op) => op.type === 'execute')).toHaveLength(1);
  });

  it('handles empty plan', async () => {
    const plan: BatchUnifiedDeltaPlan = {
      ledgerGroups: [],
      countDeltasByChannelKey: new Map(),
    };

    await applyBatchUnifiedDeltas(plan, syntheticH);
    expect(dbOps).toHaveLength(0);
  });
});

describe('frontierNodeKeys', () => {
  it('org first, then every non-null ancestor, deduplicated', () => {
    expect(frontierNodeKeys('task', { id: 't1', projectId: 'proj-1', organizationId: 'org-1' }, 'org-1', syntheticH)).toEqual([
      'org-1',
      'proj-1',
    ]);
  });

  it('org-homed row rolls up to the org node only', () => {
    expect(frontierNodeKeys('task', { id: 't1', organizationId: 'org-1' }, 'org-1', syntheticH)).toEqual(['org-1']);
  });
});

describe('sumInto', () => {
  it('sums plain delta keys on collision', () => {
    const target = { 's:ledger': 2, 'e:task': 1 };
    sumInto(target, { 'e:task': 2, 'm:admin': 1 });
    expect(target).toEqual({ 's:ledger': 2, 'e:task': 3, 'm:admin': 1 });
  });

  it('max-merges li:/lu: keys instead of summing (timestamps must not add up)', () => {
    const target = { 'li:task': 1_751_000_000_000, 'lu:task': 1_751_000_000_000 };
    // Older stamps lose
    sumInto(target, { 'li:task': 1_750_000_000_000, 'lu:task': 1_750_000_000_000 });
    expect(target['li:task']).toBe(1_751_000_000_000);
    expect(target['lu:task']).toBe(1_751_000_000_000);
    // Newer stamps win
    sumInto(target, { 'li:task': 1_752_000_000_000, 'lu:task': 1_753_000_000_000 });
    expect(target['li:task']).toBe(1_752_000_000_000);
    expect(target['lu:task']).toBe(1_753_000_000_000);
  });

  it('max-merges f: keys (frontiers only move forward)', () => {
    const target = { 'f:task': 40 };
    sumInto(target, { 'f:task': 35 });
    expect(target['f:task']).toBe(40);
    sumInto(target, { 'f:task': 41 });
    expect(target['f:task']).toBe(41);
  });

  it('max-merge keys pass through unchanged when absent from target', () => {
    const target: Record<string, number> = { 's:ledger': 1 };
    sumInto(target, { 'li:task': 1_751_000_000_000, 'f:task': 7, 'e:task': 1 });
    expect(target).toEqual({ 's:ledger': 1, 'li:task': 1_751_000_000_000, 'f:task': 7, 'e:task': 1 });
  });
});
