import { describe, it, expect } from 'vitest';

import type { EntityTableMeta, ResourceTableMeta } from '../types';
import { computeUnifiedDeltas, computeBatchUnifiedDeltas } from '../utils/compute-unified-deltas';
import type { ParseMessageResult } from '../pipeline/parse-message';
import type { InsertActivityModel } from '#/db/schema/activities';

// ── Test helpers ─────────────────────────────────────────────────────────────

// `attachment` has parent = organization. resolveContextKey() therefore returns
// organizationId, so seq and entity-count deltas collapse onto a single
// contextKey (no separate parent delta because parentType === 'organization').
function attachmentEntry(): EntityTableMeta {
  return { kind: 'entity', type: 'attachment', table: { [Symbol.for('drizzle:Name')]: 'attachments' } } as unknown as EntityTableMeta;
}

// `page` has parent = null. resolveContextKey() returns 'public:page', which
// gives us a contextKey distinct from organizationId — useful to assert
// multi-contextKey accumulation.
function pageEntry(): EntityTableMeta {
  return { kind: 'entity', type: 'page', table: { [Symbol.for('drizzle:Name')]: 'pages' } } as unknown as EntityTableMeta;
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

function mockResult(overrides: {
  tableMeta: EntityTableMeta | ResourceTableMeta;
  action: string;
  rowData: Record<string, unknown> & { id: string };
  oldRowData?: Record<string, unknown> & { id: string };
  organizationId?: string | null;
}): ParseMessageResult {
  return mockEvent(overrides).result;
}

// ── computeUnifiedDeltas ─────────────────────────────────────────────────────

describe('computeUnifiedDeltas', () => {
  it('attachment create: seq + entity count deltas merged onto org contextKey', () => {
    const plan = computeUnifiedDeltas(
      mockResult({
        tableMeta: attachmentEntry(),
        action: 'create',
        rowData: { id: 'att-1', organizationId: 'org-1' },
      }),
    );

    expect(plan.seqContextKey).toBe('org-1');
    expect(plan.seqKey).toBe('s:attachment');
    expect(plan.entityStamp).toEqual({ tableName: 'attachments', entityId: 'att-1' });

    // Parent is organization, so seq and entity count merge on the single org row
    expect(plan.deltasByContextKey.get('org-1')).toEqual({ 's:attachment': 1, 'e:attachment': 1 });
    expect(plan.deltasByContextKey.size).toBe(1);
  });

  it('page create (parentless product, with org): seq on public + on org', () => {
    const plan = computeUnifiedDeltas(
      mockResult({
        tableMeta: pageEntry(),
        action: 'create',
        rowData: { id: 'page-1', organizationId: 'org-1' },
      }),
    );

    expect(plan.seqContextKey).toBe('public:page');
    expect(plan.seqKey).toBe('s:page');
    expect(plan.entityStamp).toEqual({ tableName: 'pages', entityId: 'page-1' });

    // public:page gets seq delta only; org gets both the org-signal seq and the entity count
    expect(plan.deltasByContextKey.get('public:page')).toEqual({ 's:page': 1 });
    expect(plan.deltasByContextKey.get('org-1')).toEqual({ 's:page': 1, 'e:page': 1 });
    expect(plan.deltasByContextKey.size).toBe(2);
  });

  it('attachment delete: no seq stamp, decrement entity count on org', () => {
    const plan = computeUnifiedDeltas(
      mockResult({
        tableMeta: attachmentEntry(),
        action: 'delete',
        rowData: { id: 'att-1', organizationId: 'org-1' },
        oldRowData: { id: 'att-1', organizationId: 'org-1' },
      }),
    );

    expect(plan.seqContextKey).toBeNull();
    expect(plan.seqKey).toBeNull();
    expect(plan.entityStamp).toBeNull();

    expect(plan.deltasByContextKey.get('org-1')).toEqual({ 'e:attachment': -1 });
    expect(plan.deltasByContextKey.size).toBe(1);
  });

  it('attachment update: seq delta only (no count delta on updates)', () => {
    const plan = computeUnifiedDeltas(
      mockResult({
        tableMeta: attachmentEntry(),
        action: 'update',
        rowData: { id: 'att-1', organizationId: 'org-1' },
        oldRowData: { id: 'att-1', organizationId: 'org-1' },
      }),
    );

    expect(plan.seqContextKey).toBe('org-1');
    expect(plan.seqKey).toBe('s:attachment');
    expect(plan.deltasByContextKey.get('org-1')).toEqual({ 's:attachment': 1 });
    expect(plan.deltasByContextKey.size).toBe(1);
  });

  it('membership create: single delta with role + total count', () => {
    const plan = computeUnifiedDeltas(
      mockResult({
        tableMeta: membershipEntry(),
        action: 'create',
        rowData: { id: 'mem-1', organizationId: 'org-1', contextId: 'org-1', role: 'admin' },
      }),
    );

    expect(plan.seqContextKey).toBeNull();
    expect(plan.entityStamp).toBeNull();
    expect(plan.deltasByContextKey.size).toBe(1);
    expect(plan.deltasByContextKey.get('org-1')).toEqual({ 'm:admin': 1, 'm:total': 1 });
  });

  it('membership delete: decrements role + total', () => {
    const plan = computeUnifiedDeltas(
      mockResult({
        tableMeta: membershipEntry(),
        action: 'delete',
        rowData: { id: 'mem-1', organizationId: 'org-1', contextId: 'org-1', role: 'member' },
      }),
    );

    expect(plan.deltasByContextKey.get('org-1')).toEqual({ 'm:member': -1, 'm:total': -1 });
  });

  it('membership update (role change): swaps role counts', () => {
    const plan = computeUnifiedDeltas(
      mockResult({
        tableMeta: membershipEntry(),
        action: 'update',
        rowData: { id: 'mem-1', organizationId: 'org-1', contextId: 'org-1', role: 'admin' },
        oldRowData: { id: 'mem-1', organizationId: 'org-1', contextId: 'org-1', role: 'member' },
      }),
    );

    expect(plan.deltasByContextKey.get('org-1')).toEqual({ 'm:member': -1, 'm:admin': 1 });
  });

  it('inactive membership create (pending): increments pending count', () => {
    const plan = computeUnifiedDeltas(
      mockResult({
        tableMeta: inactiveMembershipEntry(),
        action: 'create',
        rowData: { id: 'imem-1', organizationId: 'org-1', contextId: 'org-1', rejectedAt: null },
      }),
    );

    expect(plan.deltasByContextKey.get('org-1')).toEqual({ 'm:pending': 1 });
  });

  it('inactive membership update (rejected): decrements pending', () => {
    const plan = computeUnifiedDeltas(
      mockResult({
        tableMeta: inactiveMembershipEntry(),
        action: 'update',
        rowData: { id: 'imem-1', organizationId: 'org-1', contextId: 'org-1', rejectedAt: '2026-01-01' },
        oldRowData: { id: 'imem-1', organizationId: 'org-1', contextId: 'org-1', rejectedAt: null },
      }),
    );

    expect(plan.deltasByContextKey.get('org-1')).toEqual({ 'm:pending': -1 });
  });

  it('attachment with no organizationId: seq still computed, no count deltas', () => {
    const plan = computeUnifiedDeltas(
      mockResult({
        tableMeta: attachmentEntry(),
        action: 'create',
        rowData: { id: 'att-1' },
        organizationId: null,
      }),
    );

    // Falls back to 'public:attachment' since parent column is missing and org is null
    expect(plan.seqContextKey).toBe('public:attachment');
    expect(plan.deltasByContextKey.get('public:attachment')).toEqual({ 's:attachment': 1 });
    expect(plan.deltasByContextKey.size).toBe(1);
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

  it('batch of page creates: accumulates seq on public:page and counts on org', () => {
    const events = Array.from({ length: 3 }, (_, i) =>
      mockEvent({
        tableMeta: pageEntry(),
        action: 'create',
        rowData: { id: `page-${i}`, organizationId: 'org-1' },
      }),
    );

    const plan = computeBatchUnifiedDeltas(events);

    expect(plan.seqGroups).toHaveLength(1);
    expect(plan.seqGroups[0].contextKey).toBe('public:page');
    expect(plan.seqGroups[0].count).toBe(3);
    // org signal because contextKey !== organizationId
    expect(plan.seqGroups[0].orgSignal).toEqual({ orgKey: 'org-1', seqKey: 's:page', count: 3 });

    expect(plan.countDeltasByContextKey.get('org-1')).toEqual({ 'e:page': 3 });
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
