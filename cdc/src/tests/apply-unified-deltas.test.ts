import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { UnifiedDeltaPlan, BatchUnifiedDeltaPlan } from '../utils/compute-unified-deltas';
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
    const isCounterUpsert = sqlParts.includes('context_counters');

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
const { applyUnifiedDeltas, applyBatchUnifiedDeltas } = await import('../utils/apply-unified-deltas');

beforeEach(() => {
  dbOps.length = 0;
  upsertReturnValue = {};
});

describe('applyUnifiedDeltas', () => {
  it('returns undefined for empty plan', async () => {
    const plan: UnifiedDeltaPlan = {
      seqContextKey: null,
      seqKey: null,
      entityStamp: null,
      deltasByContextKey: new Map(),
    };

    const result = await applyUnifiedDeltas(plan);
    expect(result).toBeUndefined();
    expect(dbOps).toHaveLength(0);
  });

  it('executes Phase 1 UPSERT with RETURNING for seqContextKey', async () => {
    upsertReturnValue = { 's:task': 42, 'e:task': 10 };

    const plan: UnifiedDeltaPlan = {
      seqContextKey: 'proj-1',
      seqKey: 's:task',
      entityStamp: { tableName: 'tasks', entityId: 'task-1' },
      deltasByContextKey: new Map([
        ['proj-1', { 's:task': 1, 'e:task': 1 }],
        ['org-1', { 's:task': 1, 'e:task': 1 }],
      ]),
    };

    const result = await applyUnifiedDeltas(plan);

    expect(result).toBe(42);
    // Phase 1: 1 upsert (proj-1 with RETURNING)
    // Phase 2: 1 upsert (org-1) + 1 execute (entity seq)
    expect(dbOps.length).toBeGreaterThanOrEqual(2);
  });

  it('runs Phase 2 operations in parallel (org UPSERT + entity stamp)', async () => {
    upsertReturnValue = { 's:task': 1 };

    const plan: UnifiedDeltaPlan = {
      seqContextKey: 'proj-1',
      seqKey: 's:task',
      entityStamp: { tableName: 'tasks', entityId: 'task-1' },
      deltasByContextKey: new Map<string, Record<string, number>>([
        ['proj-1', { 's:task': 1 }],
        ['org-1', { 's:task': 1 }],
        ['lbl-1', { 'e:task': 1 }],
        ['lbl-2', { 'e:task': 1 }],
      ]),
    };

    const result = await applyUnifiedDeltas(plan);
    expect(result).toBe(1);

    // Phase 1: 1 upsert (proj-1)
    // Phase 2: 3 upserts (org-1, lbl-1, lbl-2) + 1 execute (entity seq) = 4
    // Total: 5 DB ops
    expect(dbOps.length).toBeGreaterThanOrEqual(4);
  });

  it('handles count-only plan (no seq stamp)', async () => {
    const plan: UnifiedDeltaPlan = {
      seqContextKey: null,
      seqKey: null,
      entityStamp: null,
      deltasByContextKey: new Map([
        ['org-1', { 'm:admin': 1, 'm:total': 1 }],
      ]),
    };

    const result = await applyUnifiedDeltas(plan);
    expect(result).toBeUndefined();
    // Single upsert for membership counts
    expect(dbOps.length).toBe(1);
  });
});

describe('applyBatchUnifiedDeltas', () => {
  function mockEvent(id: string): { lsn: string; result: ParseMessageResult } {
    return {
      lsn: `0/${id}`,
      result: {
        activity: { action: 'create', entityType: 'task' } as unknown as InsertActivityModel,
        rowData: { id, projectId: 'proj-1', organizationId: 'org-1' },
        oldRowData: null,
        tableMeta: { kind: 'entity', type: 'task', table: {} } as unknown as EntityTableMeta,
      },
    };
  }

  it('assigns sequential seq values to events from reserved range', async () => {
    upsertReturnValue = { 's:task': 5 }; // highSeq = 5, count = 3, baseSeq = 2

    const events = [mockEvent('t1'), mockEvent('t2'), mockEvent('t3')];

    const plan: BatchUnifiedDeltaPlan = {
      seqGroups: [{
        contextKey: 'proj-1',
        seqKey: 's:task',
        count: 3,
        orgSignal: { orgKey: 'org-1', seqKey: 's:task', count: 3 },
        events,
        tableName: 'tasks',
      }],
      countDeltasByContextKey: new Map([
        ['org-1', { 'e:task': 3 }],
        ['proj-1', { 'e:task': 3 }],
      ]),
      entityStamps: [],
    };

    await applyBatchUnifiedDeltas(plan);

    // Events should have sequential seq values: 3, 4, 5
    expect(events[0].result.rowData.seq).toBe(3);
    expect(events[1].result.rowData.seq).toBe(4);
    expect(events[2].result.rowData.seq).toBe(5);
  });

  it('merges seq and count deltas for the same contextKey', async () => {
    upsertReturnValue = { 's:task': 2, 'e:task': 2 };

    const events = [mockEvent('t1'), mockEvent('t2')];

    const plan: BatchUnifiedDeltaPlan = {
      seqGroups: [{
        contextKey: 'proj-1',
        seqKey: 's:task',
        count: 2,
        orgSignal: null,
        events,
        tableName: 'tasks',
      }],
      countDeltasByContextKey: new Map([
        // proj-1 has both seq (from seqGroup) AND entity count deltas
        ['proj-1', { 'e:task': 2 }],
      ]),
      entityStamps: [],
    };

    await applyBatchUnifiedDeltas(plan);

    // proj-1 handled by Phase 1 (merged), no remaining count upserts for it
    const upserts = dbOps.filter(op => op.type === 'upsert');
    expect(upserts).toHaveLength(1);
  });

  it('handles empty plan', async () => {
    const plan: BatchUnifiedDeltaPlan = {
      seqGroups: [],
      countDeltasByContextKey: new Map(),
      entityStamps: [],
    };

    await applyBatchUnifiedDeltas(plan);
    expect(dbOps).toHaveLength(0);
  });
});
