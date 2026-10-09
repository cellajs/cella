import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockBatchEvent } from './factories';

vi.mock('../network/websocket-client', () => ({ wsClient: { send: vi.fn(() => true) } }));
vi.mock('shared/utils/nanoid', () => ({ nanoid: () => 'mock-token', nanoidTenant: () => 'mock-t' }));

import { wsClient } from '../network/websocket-client';
import { generateActivityId, sendBatchMessageToApi } from '../services/activity-service';

describe('generateActivityId', () => {
  const idOf = (commitLsn: string, index = 0) => generateActivityId({ lsn: '0/1', commitLsn, index });

  it('joins the padded commit position and the padded index into a fixed 26-char id', () => {
    expect(idOf('0/16B3748')).toBe('00000000-016B3748-00000000');
    expect(idOf('0/16B3748', 12)).toBe('00000000-016B3748-00000012');
    expect(idOf('1/0', 3)).toHaveLength(26);
  });

  it('is the same on every delivery, for idempotent replay', () => {
    expect(idOf('A/FF', 4)).toBe(idOf('A/FF', 4));
  });

  it('tells the changes of one transaction apart, also the rows of one WAL record, which share an LSN', () => {
    const rows = [0, 1, 2, 11].map((index) => generateActivityId({ lsn: '0/50', commitLsn: '0/90', index }));

    expect(new Set(rows).size).toBe(4);
    expect([...rows].sort()).toEqual(rows);
  });

  it('sorts in commit order, whatever the positions of the changes themselves', () => {
    // A long transaction wrote first (0/10) and committed last (0/200); a short one wrote later and committed first.
    const long = generateActivityId({ lsn: '0/10', commitLsn: '0/200', index: 0 });
    const short = generateActivityId({ lsn: '0/50', commitLsn: '0/9F', index: 7 });

    expect(short < long).toBe(true);
  });

  it('sorts correctly across digit-width changes and a 32-bit segment rollover', () => {
    expect(idOf('0/9F') < idOf('0/100')).toBe(true);
    expect(idOf('0/FFFFFFFF', 99) < idOf('1/00000000')).toBe(true);
  });

  it('takes the position of the change itself for an event outside a transaction', () => {
    expect(generateActivityId({ lsn: '0/16B3748' })).toBe('00000000-016B3748-00000000');
  });
});

describe('sendBatchMessageToApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sends correct seq range for contiguous seqs', () => {
    const events = [mockBatchEvent(10), mockBatchEvent(11), mockBatchEvent(12)];
    sendBatchMessageToApi(events, { traceId: 'test', spanId: 'test' } as never);

    expect(wsClient.send).toHaveBeenCalledOnce();
    const payload = vi.mocked(wsClient.send).mock.calls[0][0] as Record<string, unknown>;
    const activity = payload.activity as Record<string, unknown>;

    expect(activity.seq).toBe(10); // minSeq
    expect(activity.batchUntilSeq).toBe(12); // maxSeq
  });

  it('accepts non-contiguous sequence positions within one group and carries the exact count', () => {
    // Ranges may interleave across groups: 10..12 with 2 rows is legal, `count` is authoritative.
    const events = [mockBatchEvent(10), mockBatchEvent(12)];
    sendBatchMessageToApi(events, { traceId: 'test', spanId: 'test' } as never);

    const payload = vi.mocked(wsClient.send).mock.calls[0][0] as never as { activity: { seq?: number; batchUntilSeq?: number; count?: number } };
    expect(payload.activity.seq).toBe(10);
    expect(payload.activity.batchUntilSeq).toBe(12);
    expect(payload.activity.count).toBe(2);
  });

  it('splits a cross-context batch into per-context messages with contiguous ranges', () => {
    // Seqs are per-context counters: org-a holds 10-11 and org-b holds 5-7.
    const inOrg = (org: string, seq: number): ReturnType<typeof mockBatchEvent> => {
      const event = mockBatchEvent(seq, `entity-${org}-${seq}`);
      return { ...event, rowData: { ...event.rowData, organizationId: org } };
    };
    // Interleaved on purpose: grouping must not depend on input order.
    const events = [inOrg('org-a', 10), inOrg('org-b', 5), inOrg('org-a', 11), inOrg('org-b', 6), inOrg('org-b', 7)];
    sendBatchMessageToApi(events, { traceId: 'test', spanId: 'test' } as never);

    expect(wsClient.send).toHaveBeenCalledTimes(2);
    const payloads = vi
      .mocked(wsClient.send)
      .mock.calls.map(
        (call) =>
          call[0] as never as { activity: { seq?: number; batchUntilSeq?: number }; rowData: Record<string, unknown>; batchRows: { seq?: number }[] },
      );
    const orgA = payloads.find((p) => p.rowData.organizationId === 'org-a');
    const orgB = payloads.find((p) => p.rowData.organizationId === 'org-b');

    expect(orgA?.activity.seq).toBe(10);
    expect(orgA?.activity.batchUntilSeq).toBe(11);
    expect(orgB?.activity.seq).toBe(5);
    expect(orgB?.activity.batchUntilSeq).toBe(7);
    // Each message speaks only for its own context's rows
    expect(orgA?.batchRows.map((row) => row.seq)).toEqual([10, 11]);
    expect(orgB?.batchRows.map((row) => row.seq)).toEqual([5, 6, 7]);
  });

  it('sends a group of one row as a single-row message, so the tab that wrote it knows its own write', () => {
    const stx = { mutationId: 'mut-1', sourceId: 'tab-a', fieldTimestamps: {} };
    const inOrg = (org: string, seq: number): ReturnType<typeof mockBatchEvent> => {
      const event = mockBatchEvent(seq, `entity-${org}-${seq}`);
      return { ...event, rowData: { ...event.rowData, organizationId: org, stx, name: 'renamed' } };
    };
    // One flush, two organizations: org-a has one edit, org-b two.
    sendBatchMessageToApi([inOrg('org-a', 10), inOrg('org-b', 5), inOrg('org-b', 6)], { traceId: 'test', spanId: 'test' } as never);

    const payloads = vi.mocked(wsClient.send).mock.calls.map(
      (call) =>
        call[0] as never as {
          activity: { seq?: number; batchUntilSeq?: number; count?: number };
          rowData: Record<string, unknown>;
          batchRows?: unknown[];
        },
    );
    const alone = payloads.find((p) => p.rowData.organizationId === 'org-a');
    const together = payloads.find((p) => p.rowData.organizationId === 'org-b');

    // No range and no batch rows: the API builds a notification for this one row, with its stx.
    expect(alone?.activity.seq).toBe(10);
    expect(alone?.activity.batchUntilSeq).toBeUndefined();
    expect(alone?.batchRows).toBeUndefined();
    expect(alone?.rowData).toMatchObject({ name: 'renamed', stx });
    // Positive control: two rows for one audience stay a batch.
    expect(together?.activity).toMatchObject({ seq: 5, batchUntilSeq: 6, count: 2 });
    expect(together?.batchRows).toHaveLength(2);
  });

  it('slims batch rows to permission-relevant fields only', () => {
    const event = mockBatchEvent(10);
    const second = mockBatchEvent(11);
    const events = [
      { ...event, rowData: { ...event.rowData, organizationId: 'org-a', createdBy: 'u1', name: 'secret' } },
      { ...second, rowData: { ...second.rowData, organizationId: 'org-a' } },
    ];
    sendBatchMessageToApi(events, { traceId: 'test', spanId: 'test' } as never);

    const payload = vi.mocked(wsClient.send).mock.calls[0][0] as never as { batchRows: { seq?: number; rowData: Record<string, unknown> }[] };
    // Context ids and audit fields stay; content fields never hit the wire.
    expect(payload.batchRows[0].rowData).toEqual({ id: event.rowData.id, organizationId: 'org-a', createdBy: 'u1' });
  });

  it('groups non-product entities (user) by org instead of demanding a channel ancestor', () => {
    // Non-product batches lack sequence context, so they group under the resource fallback.
    const asUser = (seq: number): ReturnType<typeof mockBatchEvent> => {
      const event = mockBatchEvent(seq, `user-${seq}`);
      return {
        ...event,
        activity: { ...event.activity, entityType: 'user', organizationId: null } as typeof event.activity,
        rowData: { id: `user-${seq}` },
        seq: undefined,
      };
    };
    const events = [asUser(1), asUser(2)];

    expect(() => sendBatchMessageToApi(events, { traceId: 'test', spanId: 'test' } as never)).not.toThrow();
    expect(wsClient.send).toHaveBeenCalledOnce();
  });

  it('handles events without seqs (delete batches)', () => {
    const events = [mockBatchEvent(1), mockBatchEvent(2)].map((e) => ({ ...e, seq: undefined }));
    for (const e of events) (e.activity as Record<string, unknown>).action = 'delete';

    sendBatchMessageToApi(events, { traceId: 'test', spanId: 'test' } as never);

    expect(wsClient.send).toHaveBeenCalledOnce();
    const payload = vi.mocked(wsClient.send).mock.calls[0][0] as Record<string, unknown>;
    const activity = payload.activity as Record<string, unknown>;
    expect(activity.batchUntilSeq).toBeUndefined();
    expect(activity.action).toBe('delete');
    expect(activity.deletedIds).toBeUndefined();
  });
});
