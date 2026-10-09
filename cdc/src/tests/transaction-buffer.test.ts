import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ParseMessageResult } from '../pipeline/parse-message';
import { TransactionBuffer } from '../services/transaction-buffer';
import { mockParseResult } from './factories';

describe('TransactionBuffer', () => {
  let processedEvents: Array<{ lsn: string; result: ParseMessageResult }>;
  let onSurvivingEvents: (events: Array<{ lsn: string; result: ParseMessageResult }>) => Promise<void>;
  let buffer: TransactionBuffer;

  beforeEach(() => {
    processedEvents = [];

    onSurvivingEvents = vi.fn(async (events: Array<{ lsn: string; result: ParseMessageResult }>) => {
      for (const event of events) {
        processedEvents.push(event);
      }
    });

    buffer = new TransactionBuffer(onSurvivingEvents);
  });

  it('passes through events when no transaction is active', async () => {
    const result = mockParseResult({ action: 'create', entityType: 'attachment' });
    await buffer.onEvent('0/1', result);

    expect(processedEvents).toHaveLength(1);
    expect(processedEvents[0].lsn).toBe('0/1');
  });

  it('buffers events within a transaction and releases on commit', async () => {
    buffer.onBegin({ tag: 'begin', xid: 1, commitLsn: null, commitTime: BigInt(0) });

    const r1 = mockParseResult({ action: 'create', entityType: 'attachment' });
    const r2 = mockParseResult({ action: 'create', entityType: 'attachment' });
    await buffer.onEvent('0/1', r1);
    await buffer.onEvent('0/2', r2);

    expect(processedEvents).toHaveLength(0);

    await buffer.onCommit();

    expect(processedEvents).toHaveLength(2);
  });

  it('keeps a transaction whole however long it takes to arrive', async () => {
    vi.useFakeTimers();
    try {
      buffer.onBegin({ tag: 'begin', xid: 2, commitLsn: null, commitTime: BigInt(0) });
      await buffer.onEvent('0/1', mockParseResult({ action: 'create', entityType: 'attachment' }));
      // A million-row transaction takes minutes to stream.
      await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
      await buffer.onEvent('0/2', mockParseResult({ action: 'create', entityType: 'attachment' }));

      expect(onSurvivingEvents).not.toHaveBeenCalled();

      await buffer.onCommit();

      expect(onSurvivingEvents).toHaveBeenCalledTimes(1);
      expect(processedEvents.map((event) => event.lsn)).toEqual(['0/1', '0/2']);
    } finally {
      vi.useRealTimers();
    }
  });

  it('must not hold a transaction past its limit: it fails there and frees what it held', async () => {
    const small = new TransactionBuffer(onSurvivingEvents, { maxEvents: 3 });
    small.onBegin({ tag: 'begin', xid: 9, commitLsn: '0/90', commitTime: BigInt(0) });
    for (let index = 0; index < 3; index++) await small.onEvent(`0/${index}`, mockParseResult({ action: 'create', entityType: 'attachment' }), index);

    await expect(small.onEvent('0/3', mockParseResult({ action: 'create', entityType: 'attachment' }), 3)).rejects.toThrow(
      'holds more than 3 changes',
    );

    // Nothing of it is left: a commit that still came would emit nothing.
    expect(small.isBuffering).toBe(false);
    await small.onCommit();
    expect(onSurvivingEvents).not.toHaveBeenCalled();
  });

  it('emits no part of a transaction whose COMMIT never came', async () => {
    buffer.onBegin({ tag: 'begin', xid: 3, commitLsn: null, commitTime: BigInt(0) });
    await buffer.onEvent('0/1', mockParseResult({ action: 'create', entityType: 'attachment' }));

    buffer.onBegin({ tag: 'begin', xid: 4, commitLsn: null, commitTime: BigInt(0) });
    await buffer.onEvent('0/5', mockParseResult({ action: 'create', entityType: 'attachment' }));
    await buffer.onCommit();

    expect(processedEvents.map((event) => event.lsn)).toEqual(['0/5']);
  });

  it('gives each event its transaction commit time, the same on every delivery', async () => {
    // As the replication client reports it: microseconds since the Unix epoch.
    const commitTime = BigInt(Date.parse('2026-10-09T00:00:00.123Z')) * 1000n;

    for (const xid of [7, 8]) {
      buffer.onBegin({ tag: 'begin', xid, commitLsn: null, commitTime });
      await buffer.onEvent('0/1', mockParseResult({ action: 'create', entityType: 'attachment' }));
      await buffer.onCommit();
    }

    expect(processedEvents.map((event) => event.result.activity.createdAt)).toEqual(['2026-10-09T00:00:00.123Z', '2026-10-09T00:00:00.123Z']);
  });

  it('suppresses cascaded child deletes when the parent channel entity is deleted', async () => {
    buffer.onBegin({ tag: 'begin', xid: 42, commitLsn: null, commitTime: BigInt(0) });

    const t1 = mockParseResult({ action: 'delete', entityType: 'attachment', subjectId: 'attachment-1', organizationId: 'org-1' });
    const t2 = mockParseResult({ action: 'delete', entityType: 'attachment', subjectId: 'attachment-2', organizationId: 'org-1' });
    const t3 = mockParseResult({ action: 'delete', entityType: 'attachment', subjectId: 'attachment-3', organizationId: 'org-1' });

    const m1 = mockParseResult({ action: 'delete', resourceType: 'membership', entityType: null, subjectId: 'mem-1', organizationId: 'org-1' });

    const proj = mockParseResult({ action: 'delete', entityType: 'organization', subjectId: 'org-1', organizationId: 'org-1' });

    await buffer.onEvent('0/1', t1);
    await buffer.onEvent('0/2', t2);
    await buffer.onEvent('0/3', t3);
    await buffer.onEvent('0/5', m1);
    await buffer.onEvent('0/6', proj);

    await buffer.onCommit();

    expect(processedEvents).toHaveLength(1);
    const survivors = processedEvents.map((e) => ({ entityType: e.result.activity.entityType, subjectId: e.result.activity.subjectId }));
    expect(survivors).toContainEqual({ entityType: 'organization', subjectId: 'org-1' });
  });

  it('does not suppress deletes from different channel entities', async () => {
    buffer.onBegin({ tag: 'begin', xid: 43, commitLsn: null, commitTime: BigInt(0) });

    const proj = mockParseResult({ action: 'delete', entityType: 'organization', subjectId: 'org-1', organizationId: 'org-1' });

    // Different org: not suppressed.
    const t1 = mockParseResult({ action: 'delete', entityType: 'attachment', subjectId: 'attachment-99', organizationId: 'org-other' });

    // Deleted org: suppressed.
    const t2 = mockParseResult({ action: 'delete', entityType: 'attachment', subjectId: 'attachment-1', organizationId: 'org-1' });

    await buffer.onEvent('0/1', proj);
    await buffer.onEvent('0/2', t1);
    await buffer.onEvent('0/3', t2);

    await buffer.onCommit();

    expect(processedEvents).toHaveLength(2);
    expect(processedEvents[0].result.activity.subjectId).toBe('org-1');
    expect(processedEvents[1].result.activity.subjectId).toBe('attachment-99');
  });

  it('does not suppress non-delete events even in cascade transactions', async () => {
    buffer.onBegin({ tag: 'begin', xid: 44, commitLsn: null, commitTime: BigInt(0) });

    const update = mockParseResult({ action: 'update', entityType: 'attachment', subjectId: 'attachment-1' });
    const proj = mockParseResult({ action: 'delete', entityType: 'organization', subjectId: 'org-1', organizationId: 'org-1' });

    await buffer.onEvent('0/1', update);
    await buffer.onEvent('0/2', proj);

    await buffer.onCommit();

    expect(processedEvents).toHaveLength(2);
  });

  it('suppresses cascaded deletes via org-level cascade', async () => {
    buffer.onBegin({ tag: 'begin', xid: 45, commitLsn: null, commitTime: BigInt(0) });

    const org = mockParseResult({ action: 'delete', entityType: 'organization', subjectId: 'org-1' });
    const t1 = mockParseResult({ action: 'delete', entityType: 'attachment', subjectId: 'attachment-1', organizationId: 'org-1' });
    const m1 = mockParseResult({ action: 'delete', resourceType: 'membership', entityType: null, subjectId: 'mem-1', organizationId: 'org-1' });

    await buffer.onEvent('0/1', org);
    await buffer.onEvent('0/2', t1);
    await buffer.onEvent('0/3', m1);

    await buffer.onCommit();

    expect(processedEvents).toHaveLength(1);
    expect(processedEvents[0].result.activity.subjectId).toBe('org-1');
  });

  it('must not count suppressed deletes towards the limit: a cascade larger than it leaves one change', async () => {
    const small = new TransactionBuffer(onSurvivingEvents, { maxEvents: 3 });
    small.onBegin({ tag: 'begin', xid: 100, commitLsn: null, commitTime: BigInt(0) });
    await small.onEvent('0/0', mockParseResult({ action: 'delete', entityType: 'organization', subjectId: 'org-1' }));

    // Far more cascaded deletes than the buffer holds: each is dropped as it arrives, so none of them is held.
    for (let i = 0; i < 50; i++) {
      await small.onEvent(
        `0/${i + 1}`,
        mockParseResult({ action: 'delete', entityType: 'attachment', subjectId: `attachment-${i}`, organizationId: 'org-1' }),
      );
    }
    await small.onCommit();

    expect(processedEvents).toHaveLength(1);
    expect(processedEvents[0].result.activity.entityType).toBe('organization');
  });

  it('suppresses child deletes that arrive before parent channel entity delete', async () => {
    buffer.onBegin({ tag: 'begin', xid: 101, commitLsn: null, commitTime: BigInt(0) });

    // Non-standard WAL order: children before parent.
    const t1 = mockParseResult({ action: 'delete', entityType: 'attachment', subjectId: 'attachment-1', organizationId: 'org-1' });
    const t2 = mockParseResult({ action: 'delete', entityType: 'attachment', subjectId: 'attachment-2', organizationId: 'org-1' });
    const proj = mockParseResult({ action: 'delete', entityType: 'organization', subjectId: 'org-1', organizationId: 'org-1' });

    await buffer.onEvent('0/1', t1);
    await buffer.onEvent('0/2', t2);
    await buffer.onEvent('0/3', proj);

    await buffer.onCommit();

    // Tasks are caught by the second pass at commit.
    expect(processedEvents).toHaveLength(1);
    expect(processedEvents[0].result.activity.entityType).toBe('organization');
  });

  it('emits a transaction of two types whole, as an organization created with its membership is', async () => {
    buffer.onBegin({ tag: 'begin', xid: 48, commitLsn: null, commitTime: BigInt(0) });
    await buffer.onEvent('0/1', mockParseResult({ action: 'create', entityType: 'organization', subjectId: 'org-1' }));
    await buffer.onEvent('0/2', mockParseResult({ action: 'create', resourceType: 'membership', entityType: null, subjectId: 'mem-1' }));
    await buffer.onCommit();

    expect(onSurvivingEvents).toHaveBeenCalledTimes(1);
    expect(processedEvents.map((event) => event.lsn)).toEqual(['0/1', '0/2']);
  });

  it('emits a single-change transaction once', async () => {
    buffer.onBegin({ tag: 'begin', xid: 46, commitLsn: null, commitTime: BigInt(0) });

    const result = mockParseResult({ action: 'create', entityType: 'attachment' });
    await buffer.onEvent('0/1', result);

    await buffer.onCommit();

    expect(processedEvents).toHaveLength(1);
    expect(onSurvivingEvents).toHaveBeenCalledTimes(1);
  });

  it('handles empty transactions gracefully', async () => {
    buffer.onBegin({ tag: 'begin', xid: 47, commitLsn: null, commitTime: BigInt(0) });
    await buffer.onCommit();

    expect(processedEvents).toHaveLength(0);
  });
});
