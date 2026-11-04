import { generateId } from 'shared/utils/entity-id';
import { describe, expect, it, vi } from 'vitest';
import type { ActivityRow } from '#/lib/activity-bus';
import type { AppStreamProductEvent } from '#/modules/entities/stream/types';

// The template declares no embedding: this one lets a change of its product carry a hint.
vi.mock('shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('shared')>();
  return {
    ...actual,
    appConfig: { ...actual.appConfig, productEmbeddings: [{ embeddedProduct: 'attachment', hostProduct: 'attachment', hostColumn: 'attachments' }] },
  };
});

const { buildStreamChange } = await import('./build-change');
const { maxPendingStreamBytes, maxStreamChangeIds, maxStreamChangeRows } = await import('./helpers');

const org = 'org-hint';

/** A row as a message carries it: the activity it was recorded as, its permission fields and no content. */
const row = (id: string, seq: number, deletedAt: string | null = null): ActivityRow => ({
  activityId: `act-${id}`,
  userId: null,
  changedFields: null,
  stx: null,
  rowData: { id, organizationId: org, deletedAt },
  seq,
  movedFrom: null,
});

/** A product event of one audience. The cast covers the activity columns the builder passes through unread. */
const event = (action: 'create' | 'update' | 'delete', rows: ActivityRow[]) =>
  ({
    type: `attachment.${action}d`,
    action,
    entityType: 'attachment',
    resourceType: null,
    organizationId: org,
    tenantId: 'tenant-1',
    rowData: null,
    rows,
    trace: null,
  }) as unknown as AppStreamProductEvent;

/**
 * A host keeps a copy of the rows embedded in it, and the worker drops the host updates that would say so: the hint is
 * the only word a client gets. It names every row of the message.
 */
describe('buildStreamChange: the propagation hint of an embedded product', () => {
  it('names the one row of a single-row message', () => {
    expect(buildStreamChange(event('update', [row('a1', 7)])).propagation).toMatchObject({
      embeddedProduct: 'attachment',
      update: ['a1'],
      remove: [],
    });
  });

  it('must not name the first row only when a message holds several', () => {
    const change = buildStreamChange(event('update', [row('a1', 7), row('a2', 8), row('a3', 9)]));

    expect(change.propagation).toMatchObject({ update: ['a1', 'a2', 'a3'], remove: [] });
    expect(change.rows.map(({ subjectId, seq }) => [subjectId, seq])).toEqual([
      ['a1', 7],
      ['a2', 8],
      ['a3', 9],
    ]);
  });

  it('tells a soft delete from an edit row by row, also when the first row is the edit', () => {
    const change = buildStreamChange(event('update', [row('a1', 7), row('a2', 8, '2026-10-01T10:00:00.000Z'), row('a3', 9)]));

    expect(change.propagation).toMatchObject({ update: ['a1', 'a3'], remove: ['a2'] });
  });

  it('removes every row of a delete', () => {
    const change = buildStreamChange(event('delete', [row('a1', 0), row('a2', 0)]));

    expect(change.propagation).toMatchObject({ update: [], remove: ['a1', 'a2'] });
  });
});

/**
 * Past the cap a frame names its rows by id alone, and past `maxStreamChangeIds` none, so its size stays under the pending
 * limit whatever the transaction: the client fetches the range, or removes the rows by id, or refetches its lists.
 */
describe('buildStreamChange: a frame past the row cap', () => {
  const many = (count: number, seq: (index: number) => number) => Array.from({ length: count }, (_, index) => row(`a${index}`, seq(index)));

  it('names every row at the cap', () => {
    const change = buildStreamChange(
      event(
        'update',
        many(maxStreamChangeRows, (index) => index + 1),
      ),
    );

    expect(change.rows).toHaveLength(maxStreamChangeRows);
    expect(change.overflow).toBeNull();
  });

  it('names the range of a create past it, and no row or hint', () => {
    const change = buildStreamChange(
      event(
        'create',
        many(maxStreamChangeRows + 1, (index) => 100 + index * 2),
      ),
    );

    expect(change).toMatchObject({ rows: [], propagation: null, overflow: { afterSeq: 99, untilSeq: 100 + maxStreamChangeRows * 2 } });
  });

  it('names 25 deleted rows by id and no range, and 401 by none', () => {
    const named = buildStreamChange(
      event(
        'delete',
        many(25, () => 0),
      ),
    );
    const unnamed = buildStreamChange(
      event(
        'delete',
        many(maxStreamChangeIds + 1, () => 0),
      ),
    );

    expect(named).toMatchObject({ rows: [], propagation: null, overflow: { afterSeq: null, untilSeq: null } });
    expect(named.overflow?.subjectIds).toEqual(Array.from({ length: 25 }, (_, index) => `a${index}`));
    expect(unnamed.overflow).toEqual({ afterSeq: null, untilSeq: null, subjectIds: null });
  });

  it('weighs at most a quarter of the pending limit of a stream at the most ids it names, as a frame of full rows does', () => {
    // Entity ids are UUIDs: the id is the whole weight of a row here.
    const rows = Array.from({ length: maxStreamChangeIds }, (_, index) => row(generateId(), index + 1));
    const bytes = Buffer.byteLength(JSON.stringify(buildStreamChange(event('update', rows))));

    expect(bytes).toBeLessThan(maxPendingStreamBytes / 4);
  });
});
