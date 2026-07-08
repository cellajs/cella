import { describe, it, expect } from 'vitest';

import type { EntityTableMeta, ResourceTableMeta } from '../types';
import { computeBatchUnifiedDeltas } from '../utils/compute-unified-deltas';
import type { ParseMessageResult } from '../pipeline/parse-message';
import type { InsertActivityModel } from '#/modules/activities/activities-db';

// ── Test helpers ─────────────────────────────────────────────────────────────

// `attachment` has parent = organization. resolveContextKey() therefore returns
// organizationId, so seq and entity-count deltas collapse onto a single
// contextKey (no separate parent delta because parentType === 'organization').
function attachmentEntry(): EntityTableMeta {
  return { kind: 'entity', type: 'attachment', table: { [Symbol.for('drizzle:Name')]: 'attachments' } } as unknown as EntityTableMeta;
}


function membershipEntry(): ResourceTableMeta {
  return { kind: 'resource', type: 'membership', table: { [Symbol.for('drizzle:Name')]: 'memberships' } } as unknown as ResourceTableMeta;
}

function inactiveMembershipEntry(): ResourceTableMeta {
  return { kind: 'resource', type: 'inactive_membership', table: { [Symbol.for('drizzle:Name')]: 'inactive_memberships' } } as unknown as ResourceTableMeta;
}

function mockEvent(overrides: {
  tableMeta: EntityTableMeta | ResourceTableMeta;
  action: string;
  rowData: Record<string, unknown> & { id: string };
  oldRowData?: Record<string, unknown> & { id: string };
  organizationId?: string | null;
}): { lsn: string; result: ParseMessageResult } {
  return {
    lsn: `0/${Math.random().toString(36).slice(2, 6)}`,
    result: {
      activity: {
        action: overrides.action,
        entityType: overrides.tableMeta.type,
        organizationId: overrides.organizationId ?? (overrides.rowData.organizationId as string) ?? null,
      } as unknown as InsertActivityModel,
      rowData: overrides.rowData,
      oldRowData: overrides.oldRowData ?? null,
      tableMeta: overrides.tableMeta,
    },
  };
}

// ── Membership count deltas ──────────────────────────────────────────────────
// Memberships are never seq-stampable, so all their deltas land in
// countDeltasByContextKey (no seq group). Exercised through the batch path (the
// only path the pipeline runs) by wrapping a single event in an array.

describe('membership count deltas (via computeBatchUnifiedDeltas)', () => {
  it('membership create: role + total count, plus org membership seq signal', () => {
    const plan = computeBatchUnifiedDeltas([
      mockEvent({
        tableMeta: membershipEntry(),
        action: 'create',
        rowData: { id: 'mem-1', organizationId: 'org-1', contextId: 'org-1', role: 'admin' },
      }),
    ]);

    expect(plan.seqGroups).toHaveLength(0);
    expect(plan.countDeltasByContextKey.get('org-1')).toEqual({ 'm:admin': 1, 'm:total': 1, 's:membership': 1 });
  });

  it('membership delete: decrements role + total', () => {
    const plan = computeBatchUnifiedDeltas([
      mockEvent({
        tableMeta: membershipEntry(),
        action: 'delete',
        rowData: { id: 'mem-1', organizationId: 'org-1', contextId: 'org-1', role: 'member' },
      }),
    ]);

    expect(plan.countDeltasByContextKey.get('org-1')).toEqual({ 'm:member': -1, 'm:total': -1, 's:membership': 1 });
  });

  it('membership update (role change): swaps role counts', () => {
    const plan = computeBatchUnifiedDeltas([
      mockEvent({
        tableMeta: membershipEntry(),
        action: 'update',
        rowData: { id: 'mem-1', organizationId: 'org-1', contextId: 'org-1', role: 'admin' },
        oldRowData: { id: 'mem-1', organizationId: 'org-1', contextId: 'org-1', role: 'member' },
      }),
    ]);

    expect(plan.countDeltasByContextKey.get('org-1')).toEqual({ 'm:member': -1, 'm:admin': 1, 's:membership': 1 });
  });

  it('inactive membership create (pending): increments pending count', () => {
    const plan = computeBatchUnifiedDeltas([
      mockEvent({
        tableMeta: inactiveMembershipEntry(),
        action: 'create',
        rowData: { id: 'imem-1', organizationId: 'org-1', contextId: 'org-1', rejectedAt: null },
      }),
    ]);

    expect(plan.countDeltasByContextKey.get('org-1')).toEqual({ 'm:pending': 1, 's:membership': 1 });
  });

  it('inactive membership update (rejected): decrements pending', () => {
    const plan = computeBatchUnifiedDeltas([
      mockEvent({
        tableMeta: inactiveMembershipEntry(),
        action: 'update',
        rowData: { id: 'imem-1', organizationId: 'org-1', contextId: 'org-1', rejectedAt: '2026-01-01' },
        oldRowData: { id: 'imem-1', organizationId: 'org-1', contextId: 'org-1', rejectedAt: null },
      }),
    ]);

    expect(plan.countDeltasByContextKey.get('org-1')).toEqual({ 'm:pending': -1, 's:membership': 1 });
  });
});

// ── computeBatchUnifiedDeltas ────────────────────────────────────────────────

describe('computeBatchUnifiedDeltas', () => {
  it('batch of 5 attachment creates in same org: accumulates deltas', () => {
    const events = Array.from({ length: 5 }, (_, i) =>
      mockEvent({
        tableMeta: attachmentEntry(),
        action: 'create',
        rowData: { id: `att-${i}`, organizationId: 'org-1' },
      }),
    );

    const plan = computeBatchUnifiedDeltas(events);

    // One seq group for (org-1, attachment)
    expect(plan.seqGroups).toHaveLength(1);
    expect(plan.seqGroups[0].contextKey).toBe('org-1');
    expect(plan.seqGroups[0].seqKey).toBe('s:attachment');
    expect(plan.seqGroups[0].count).toBe(5);
    expect(plan.seqGroups[0].events).toHaveLength(5);

    // ctx === org → no separate org signal
    expect(plan.seqGroups[0].orgSignal).toBeNull();

    // Count deltas: accumulated across all 5 events on org
    expect(plan.countDeltasByContextKey.get('org-1')).toEqual({ 'e:attachment': 5 });
  });

  it('batch with non-stampable events (deletes): no seq groups, count deltas accumulated', () => {
    const events = [
      mockEvent({
        tableMeta: attachmentEntry(),
        action: 'delete',
        rowData: { id: 'att-1', organizationId: 'org-1' },
        oldRowData: { id: 'att-1', organizationId: 'org-1' },
      }),
      mockEvent({
        tableMeta: attachmentEntry(),
        action: 'delete',
        rowData: { id: 'att-2', organizationId: 'org-1' },
        oldRowData: { id: 'att-2', organizationId: 'org-1' },
      }),
    ];

    const plan = computeBatchUnifiedDeltas(events);

    expect(plan.seqGroups).toHaveLength(0);
    expect(plan.countDeltasByContextKey.get('org-1')).toEqual({ 'e:attachment': -2 });
  });

  it('batch of attachment soft deletes: seq group and count deltas accumulated', () => {
    const events = [
      mockEvent({
        tableMeta: attachmentEntry(),
        action: 'update',
        rowData: { id: 'att-1', organizationId: 'org-1', deletedAt: '2026-06-16T20:00:00.000Z' },
        oldRowData: { id: 'att-1', organizationId: 'org-1', deletedAt: null },
      }),
      mockEvent({
        tableMeta: attachmentEntry(),
        action: 'update',
        rowData: { id: 'att-2', organizationId: 'org-1', deletedAt: '2026-06-16T20:00:00.000Z' },
        oldRowData: { id: 'att-2', organizationId: 'org-1', deletedAt: null },
      }),
    ];

    const plan = computeBatchUnifiedDeltas(events);

    expect(plan.seqGroups).toHaveLength(1);
    expect(plan.seqGroups[0].contextKey).toBe('org-1');
    expect(plan.seqGroups[0].seqKey).toBe('s:attachment');
    expect(plan.seqGroups[0].count).toBe(2);
    expect(plan.countDeltasByContextKey.get('org-1')).toEqual({ 'e:attachment': -2 });
  });

  it('no contextKey is duplicated across seq groups', () => {
    const events = Array.from({ length: 3 }, (_, i) =>
      mockEvent({
        tableMeta: attachmentEntry(),
        action: 'create',
        rowData: { id: `att-${i}`, organizationId: `org-${i}` },
      }),
    );

    const plan = computeBatchUnifiedDeltas(events);

    const seqContextKeys = plan.seqGroups.map((g) => g.contextKey);
    expect(new Set(seqContextKeys).size).toBe(seqContextKeys.length);
  });
});
