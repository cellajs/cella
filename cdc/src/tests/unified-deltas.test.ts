import { describe, it, expect } from 'vitest';

import type { EntityTableMeta, ResourceTableMeta } from '../types';
import { computeBatchUnifiedDeltas } from '../utils/compute-unified-deltas';
import type { ParseMessageResult } from '../pipeline/parse-message';
import type { InsertActivityModel } from '#/modules/activities/activities-db';

// ── Test helpers ─────────────────────────────────────────────────────────────

// `attachment` has parent = organization. resolveChannelKey() therefore returns
// organizationId, so seq and entity-count deltas collapse onto a single
// channelKey (no separate parent delta because parentType === 'organization').
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

describe('membership count deltas (via computeBatchUnifiedDeltas)', () => {
  it('membership create: role + total count, plus org membership seq signal', () => {
    const plan = computeBatchUnifiedDeltas([
      mockEvent({
        tableMeta: membershipEntry(),
        action: 'create',
        rowData: { id: 'mem-1', organizationId: 'org-1', channelId: 'org-1', role: 'admin' },
      }),
    ]);

    expect(plan.orgSequenceGroups).toHaveLength(0);
    expect(plan.countDeltasByChannelKey.get('org-1')).toEqual({ 'm:admin': 1, 'm:total': 1, 'membership': 1 });
  });

  it('membership delete: decrements role + total', () => {
    const plan = computeBatchUnifiedDeltas([
      mockEvent({
        tableMeta: membershipEntry(),
        action: 'delete',
        rowData: { id: 'mem-1', organizationId: 'org-1', channelId: 'org-1', role: 'member' },
      }),
    ]);

    expect(plan.countDeltasByChannelKey.get('org-1')).toEqual({ 'm:member': -1, 'm:total': -1, 'membership': 1 });
  });

  it('membership update (role change): swaps role counts', () => {
    const plan = computeBatchUnifiedDeltas([
      mockEvent({
        tableMeta: membershipEntry(),
        action: 'update',
        rowData: { id: 'mem-1', organizationId: 'org-1', channelId: 'org-1', role: 'admin' },
        oldRowData: { id: 'mem-1', organizationId: 'org-1', channelId: 'org-1', role: 'member' },
      }),
    ]);

    expect(plan.countDeltasByChannelKey.get('org-1')).toEqual({ 'm:member': -1, 'm:admin': 1, 'membership': 1 });
  });

  it('inactive membership create (pending): increments pending count', () => {
    const plan = computeBatchUnifiedDeltas([
      mockEvent({
        tableMeta: inactiveMembershipEntry(),
        action: 'create',
        rowData: { id: 'imem-1', organizationId: 'org-1', channelId: 'org-1', rejectedAt: null },
      }),
    ]);

    expect(plan.countDeltasByChannelKey.get('org-1')).toEqual({ 'm:pending': 1, 'membership': 1 });
  });

  it('inactive membership update (rejected): decrements pending', () => {
    const plan = computeBatchUnifiedDeltas([
      mockEvent({
        tableMeta: inactiveMembershipEntry(),
        action: 'update',
        rowData: { id: 'imem-1', organizationId: 'org-1', channelId: 'org-1', rejectedAt: '2026-01-01' },
        oldRowData: { id: 'imem-1', organizationId: 'org-1', channelId: 'org-1', rejectedAt: null },
      }),
    ]);

    expect(plan.countDeltasByChannelKey.get('org-1')).toEqual({ 'm:pending': -1, 'membership': 1 });
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

    // One sequence group per organization (all product types share the org sequence)
    expect(plan.orgSequenceGroups).toHaveLength(1);
    expect(plan.orgSequenceGroups[0].orgKey).toBe('org-1');
    expect(plan.orgSequenceGroups[0].count).toBe(5);
    expect(plan.orgSequenceGroups[0].events).toHaveLength(5);

    // Count deltas: accumulated across all 5 events on org, plus one activity stamp
    // (rows carry no createdAt here, so the stamp falls back to Date.now())
    expect(plan.countDeltasByChannelKey.get('org-1')).toEqual({
      'e:attachment': 5,
      'es:attachment': 5,
      'li:attachment': expect.any(Number),
    });
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

    expect(plan.orgSequenceGroups).toHaveLength(0);
    expect(plan.countDeltasByChannelKey.get('org-1')).toEqual({ 'e:attachment': -2, 'es:attachment': -2 });
  });

  it('batch of attachment soft deletes: sequence group and count deltas accumulated', () => {
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

    expect(plan.orgSequenceGroups).toHaveLength(1);
    expect(plan.orgSequenceGroups[0].orgKey).toBe('org-1');
    expect(plan.orgSequenceGroups[0].count).toBe(2);
    expect(plan.countDeltasByChannelKey.get('org-1')).toEqual({ 'e:attachment': -2, 'es:attachment': -2 });
  });

  it('one sequence group per organization, never duplicated', () => {
    const events = Array.from({ length: 3 }, (_, i) =>
      mockEvent({
        tableMeta: attachmentEntry(),
        action: 'create',
        rowData: { id: `att-${i}`, organizationId: `org-${i}` },
      }),
    );

    const plan = computeBatchUnifiedDeltas(events);

    const orgKeys = plan.orgSequenceGroups.map((g) => g.orgKey);
    expect(new Set(orgKeys).size).toBe(orgKeys.length);
    expect(orgKeys).toHaveLength(3);
  });
});

describe('activity stamps (li:{type} / lu:{type})', () => {
  const createdAt = '2026-07-01T10:00:00.000Z';
  const createdAtMs = Date.parse(createdAt);

  it('attachment create stamps li:attachment with the row createdAt at the home key', () => {
    const plan = computeBatchUnifiedDeltas([
      mockEvent({
        tableMeta: attachmentEntry(),
        action: 'create',
        rowData: { id: 'att-1', organizationId: 'org-1', createdAt },
      }),
    ]);

    expect(plan.countDeltasByChannelKey.get('org-1')).toEqual({
      'e:attachment': 1,
      'es:attachment': 1,
      'li:attachment': createdAtMs,
    });
  });

  it('two creates in one batch max-merge the stamp (timestamps must not sum)', () => {
    const laterCreatedAt = '2026-07-02T10:00:00.000Z';
    const plan = computeBatchUnifiedDeltas([
      mockEvent({
        tableMeta: attachmentEntry(),
        action: 'create',
        rowData: { id: 'att-1', organizationId: 'org-1', createdAt: laterCreatedAt },
      }),
      mockEvent({
        tableMeta: attachmentEntry(),
        action: 'create',
        rowData: { id: 'att-2', organizationId: 'org-1', createdAt },
      }),
    ]);

    expect(plan.countDeltasByChannelKey.get('org-1')).toEqual({
      'e:attachment': 2,
      'es:attachment': 2,
      'li:attachment': Date.parse(laterCreatedAt),
    });
  });

  it('missing createdAt falls back to Date.now()', () => {
    const before = Date.now();
    const plan = computeBatchUnifiedDeltas([
      mockEvent({
        tableMeta: attachmentEntry(),
        action: 'create',
        rowData: { id: 'att-1', organizationId: 'org-1' },
      }),
    ]);
    const after = Date.now();

    const stamp = plan.countDeltasByChannelKey.get('org-1')?.['li:attachment'];
    expect(stamp).toBeGreaterThanOrEqual(before);
    expect(stamp).toBeLessThanOrEqual(after);
  });

  it('a row created directly published stamps li: from publishedAt', () => {
    const publishedAt = '2026-07-01T10:00:00.500Z';
    const plan = computeBatchUnifiedDeltas([
      mockEvent({
        tableMeta: attachmentEntry(),
        action: 'create',
        rowData: { id: 'att-1', organizationId: 'org-1', createdAt, publishedAt },
      }),
    ]);

    expect(plan.countDeltasByChannelKey.get('org-1')).toEqual({
      'e:attachment': 1,
      'es:attachment': 1,
      'li:attachment': Date.parse(publishedAt),
    });
  });

  it('genuine update stamps lu:attachment with the row updatedAt, not li:', () => {
    const updatedAt = '2026-07-05T10:00:00.000Z';
    const plan = computeBatchUnifiedDeltas([
      mockEvent({
        tableMeta: attachmentEntry(),
        action: 'update',
        rowData: { id: 'att-1', organizationId: 'org-1', createdAt, updatedAt, deletedAt: null },
        oldRowData: { id: 'att-1', organizationId: 'org-1', createdAt, deletedAt: null },
      }),
    ]);

    expect(plan.countDeltasByChannelKey.get('org-1')).toEqual({
      'lu:attachment': Date.parse(updatedAt),
    });
  });

  it('update with missing updatedAt falls back to Date.now()', () => {
    const before = Date.now();
    const plan = computeBatchUnifiedDeltas([
      mockEvent({
        tableMeta: attachmentEntry(),
        action: 'update',
        rowData: { id: 'att-1', organizationId: 'org-1', createdAt, deletedAt: null },
        oldRowData: { id: 'att-1', organizationId: 'org-1', createdAt, deletedAt: null },
      }),
    ]);
    const after = Date.now();

    const stamp = plan.countDeltasByChannelKey.get('org-1')?.['lu:attachment'];
    expect(stamp).toBeGreaterThanOrEqual(before);
    expect(stamp).toBeLessThanOrEqual(after);
  });

  it('soft-deletes never stamp (remapped to a delete internally)', () => {
    const plan = computeBatchUnifiedDeltas([
      mockEvent({
        tableMeta: attachmentEntry(),
        action: 'update',
        rowData: { id: 'att-2', organizationId: 'org-1', createdAt, deletedAt: '2026-07-03T10:00:00.000Z' },
        oldRowData: { id: 'att-2', organizationId: 'org-1', createdAt, deletedAt: null },
      }),
    ]);

    expect(plan.countDeltasByChannelKey.get('org-1')).toEqual({ 'e:attachment': -1, 'es:attachment': -1 });
  });

  it('restore does not stamp either (remapped create is not a new post)', () => {
    const plan = computeBatchUnifiedDeltas([
      mockEvent({
        tableMeta: attachmentEntry(),
        action: 'update',
        rowData: { id: 'att-1', organizationId: 'org-1', createdAt, deletedAt: null },
        oldRowData: { id: 'att-1', organizationId: 'org-1', createdAt, deletedAt: '2026-07-03T10:00:00.000Z' },
      }),
    ]);

    expect(plan.countDeltasByChannelKey.get('org-1')).toEqual({ 'e:attachment': 1, 'es:attachment': 1 });
  });
});

// The publication row filter (`published_at IS NOT NULL`) rewrites draft transitions at
// decode time: a publish edge arrives as INSERT, an unpublish as DELETE carrying the old
// (published) row, and draft creates/edits/deletes never arrive at all (the entrance
// guard in parse-message.ts drops strays — tested in parse-message.test.ts). These tests
// exercise the events as DELIVERED, so no draft rows appear below.
describe('draft lifecycle count deltas (publication row filter delivery)', () => {
  const createdAt = '2026-07-01T10:00:00.000Z';
  const publishedAt = '2026-07-04T09:00:00.000Z';

  it('a publish edge arrives as INSERT: counts as a create and stamps li: from publishedAt', () => {
    const plan = computeBatchUnifiedDeltas([
      mockEvent({
        tableMeta: attachmentEntry(),
        action: 'create',
        rowData: { id: 'att-1', organizationId: 'org-1', createdAt, updatedAt: publishedAt, publishedAt, deletedAt: null },
      }),
    ]);

    expect(plan.countDeltasByChannelKey.get('org-1')).toEqual({
      'e:attachment': 1,
      'es:attachment': 1,
      'li:attachment': Date.parse(publishedAt),
    });
    expect(plan.orgSequenceGroups).toHaveLength(1);
  });

  it('an unpublish arrives as DELETE with the old published row: counts as a delete, stamps nothing', () => {
    // CDC deletes snapshot the OLD row into rowData (oldRowData is null).
    const plan = computeBatchUnifiedDeltas([
      mockEvent({
        tableMeta: attachmentEntry(),
        action: 'delete',
        rowData: { id: 'att-1', organizationId: 'org-1', createdAt, publishedAt, deletedAt: null },
      }),
    ]);

    expect(plan.countDeltasByChannelKey.get('org-1')).toEqual({ 'e:attachment': -1, 'es:attachment': -1 });
  });

  it('publishing a trashed row arrives as INSERT with deletedAt set: counts nothing', () => {
    const plan = computeBatchUnifiedDeltas([
      mockEvent({
        tableMeta: attachmentEntry(),
        action: 'create',
        rowData: { id: 'att-1', organizationId: 'org-1', createdAt, publishedAt, deletedAt: '2026-07-03T10:00:00.000Z' },
      }),
    ]);

    expect(plan.countDeltasByChannelKey.get('org-1')).toBeUndefined();
    expect(plan.orgSequenceGroups).toHaveLength(1); // still sequence-stamped (tombstone is delta-fetchable)
  });

  it('soft-deleting a PUBLISHED row stays an UPDATE and still decrements (the two dimensions compose)', () => {
    const plan = computeBatchUnifiedDeltas([
      mockEvent({
        tableMeta: attachmentEntry(),
        action: 'update',
        rowData: { id: 'att-1', organizationId: 'org-1', createdAt, publishedAt, deletedAt: '2026-07-05T10:00:00.000Z' },
        oldRowData: { id: 'att-1', organizationId: 'org-1', createdAt, publishedAt, deletedAt: null },
      }),
    ]);

    expect(plan.countDeltasByChannelKey.get('org-1')).toEqual({ 'e:attachment': -1, 'es:attachment': -1 });
  });

  it('restoring a PUBLISHED row from trash re-counts it but does not stamp li: (old content)', () => {
    const plan = computeBatchUnifiedDeltas([
      mockEvent({
        tableMeta: attachmentEntry(),
        action: 'update',
        rowData: { id: 'att-1', organizationId: 'org-1', createdAt, publishedAt, deletedAt: null },
        oldRowData: { id: 'att-1', organizationId: 'org-1', createdAt, publishedAt, deletedAt: '2026-07-05T10:00:00.000Z' },
      }),
    ]);

    expect(plan.countDeltasByChannelKey.get('org-1')).toEqual({ 'e:attachment': 1, 'es:attachment': 1 });
  });
});
