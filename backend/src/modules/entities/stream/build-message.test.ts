import { describe, expect, it, vi } from 'vitest';
import type { ActivityEvent } from '#/lib/activity-bus';

// The template declares no embedding: this one lets a message of its product carry a hint.
vi.mock('shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('shared')>();
  return {
    ...actual,
    appConfig: { ...actual.appConfig, productEmbeddings: [{ embeddedProduct: 'attachment', hostProduct: 'attachment', hostColumn: 'attachments' }] },
  };
});

const { buildStreamNotification } = await import('./build-message');

const ORG = 'org-hint';

/** A row as a message carries it: its permission fields and no content. */
const row = (id: string, seq: number, deletedAt: string | null = null) => ({ rowData: { id, organizationId: ORG, deletedAt }, seq, movedFrom: null });

/** A product event of one audience. The cast covers the activity columns the builder passes through unread. */
const event = (action: 'create' | 'update' | 'delete', rows: ReturnType<typeof row>[]) =>
  ({
    id: 'activity-1',
    type: `attachment.${action}d`,
    action,
    entityType: 'attachment',
    resourceType: null,
    subjectId: rows[0].rowData.id,
    organizationId: ORG,
    tenantId: 'tenant-1',
    stx: null,
    rowData: null,
    rows,
    trace: null,
  }) as unknown as ActivityEvent;

/**
 * A host keeps a copy of the rows embedded in it, and the worker drops the host updates that would say so: the hint is
 * the only word a client gets. It names every row of the message.
 */
describe('buildStreamNotification: the propagation hint of an embedded product', () => {
  it('names the one row of a single-row message', () => {
    expect(buildStreamNotification(event('update', [row('a1', 7)])).propagation).toMatchObject({
      embeddedProduct: 'attachment',
      update: ['a1'],
      remove: [],
    });
  });

  it('must not name the first row only when a message holds several', () => {
    const notification = buildStreamNotification(event('update', [row('a1', 7), row('a2', 8), row('a3', 9)]));

    expect(notification.propagation).toMatchObject({ update: ['a1', 'a2', 'a3'], remove: [] });
    expect(notification).toMatchObject({ seq: 7, batchUntilSeq: 9, count: 3 });
  });

  it('tells a soft delete from an edit row by row, also when the first row is the edit', () => {
    const notification = buildStreamNotification(event('update', [row('a1', 7), row('a2', 8, '2026-10-01T10:00:00.000Z'), row('a3', 9)]));

    expect(notification.propagation).toMatchObject({ update: ['a1', 'a3'], remove: ['a2'] });
  });

  it('removes every row of a delete', () => {
    const notification = buildStreamNotification(event('delete', [row('a1', 0), row('a2', 0)]));

    expect(notification.propagation).toMatchObject({ update: [], remove: ['a1', 'a2'] });
  });
});
