import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockBatchEvent } from './factories';

// Mock dependencies before importing the module under test
vi.mock('../network/websocket-client', () => ({
  wsClient: { send: vi.fn(() => true) },
}));
vi.mock('shared/utils/nanoid', () => ({
  nanoid: () => 'mock-token',
  nanoidTenant: () => 'mock-t',
}));

import { generateActivityId, sendBatchMessageToApi } from '../services/activity-service';
import { wsClient } from '../network/websocket-client';
import { log } from '../lib/pino';

describe('generateActivityId', () => {
  it('zero-pads both LSN segments to a fixed 17-char width', () => {
    expect(generateActivityId('0/16B3748')).toBe('00000000-016B3748');
    expect(generateActivityId('0/16B3748')).toHaveLength(17);
    expect(generateActivityId('1/0')).toBe('00000001-00000000');
  });

  it('is deterministic (same LSN → same id) for idempotent replay', () => {
    expect(generateActivityId('A/FF')).toBe(generateActivityId('A/FF'));
  });

  it('sorts lexicographically in true commit order across digit-width changes', () => {
    // "0/9F" commits before "0/100"; unpadded string compare would invert this.
    const earlier = generateActivityId('0/9F');
    const later = generateActivityId('0/100');
    expect(earlier < later).toBe(true);
  });

  it('sorts correctly across a 32-bit segment rollover', () => {
    const before = generateActivityId('0/FFFFFFFF');
    const after = generateActivityId('1/00000000');
    expect(before < after).toBe(true);
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
    // No error log for contiguous seqs
    expect(log.error).not.toHaveBeenCalled();
  });

  it('accepts non-contiguous sequence positions within one group and carries the exact count', () => {
    // Under the shared org sequence a group's range may interleave with other groups'
    // values: 10..12 with only 2 rows is legal, and `count` is authoritative.
    const events = [mockBatchEvent(10), mockBatchEvent(12)];
    sendBatchMessageToApi(events, { traceId: 'test', spanId: 'test' } as never);

    expect(log.error).not.toHaveBeenCalled();
    const payload = vi.mocked(wsClient.send).mock.calls[0][0] as never as {
      activity: { seq?: number; batchUntilSeq?: number; count?: number };
    };
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
    // Interleaved on purpose: grouping must not depend on input order
    const events = [inOrg('org-a', 10), inOrg('org-b', 5), inOrg('org-a', 11), inOrg('org-b', 6), inOrg('org-b', 7)];
    sendBatchMessageToApi(events, { traceId: 'test', spanId: 'test' } as never);

    expect(wsClient.send).toHaveBeenCalledTimes(2);
    const payloads = vi.mocked(wsClient.send).mock.calls.map((call) => call[0] as never as {
      activity: { seq?: number; batchUntilSeq?: number };
      rowData: Record<string, unknown>;
      batchRows: { seq?: number }[];
    });
    const orgA = payloads.find((p) => p.rowData.organizationId === 'org-a');
    const orgB = payloads.find((p) => p.rowData.organizationId === 'org-b');

    expect(orgA?.activity.seq).toBe(10);
    expect(orgA?.activity.batchUntilSeq).toBe(11);
    expect(orgB?.activity.seq).toBe(5);
    expect(orgB?.activity.batchUntilSeq).toBe(7);
    // Each message speaks only for its own context's rows
    expect(orgA?.batchRows.map((row) => row.seq)).toEqual([10, 11]);
    expect(orgB?.batchRows.map((row) => row.seq)).toEqual([5, 6, 7]);
    // Both ranges are contiguous, so the per-context integrity checks pass.
    expect(log.error).not.toHaveBeenCalled();
  });

  it('slims batch rows to permission-relevant fields only', () => {
    const event = mockBatchEvent(10);
    const second = mockBatchEvent(11);
    const events = [
      { ...event, rowData: { ...event.rowData, organizationId: 'org-a', createdBy: 'u1', name: 'secret' } },
      { ...second, rowData: { ...second.rowData, organizationId: 'org-a' } },
    ];
    sendBatchMessageToApi(events, { traceId: 'test', spanId: 'test' } as never);

    const payload = vi.mocked(wsClient.send).mock.calls[0][0] as never as {
      batchRows: { seq?: number; rowData: Record<string, unknown> }[];
    };
    // Context ids + identity/audit fields stay; content fields (name) never hit the wire
    expect(payload.batchRows[0].rowData).toEqual({
      id: event.rowData.id,
      organizationId: 'org-a',
      createdBy: 'u1',
    });
  });

  it('groups non-product entities (user) by org instead of demanding a channel ancestor', () => {
    // A user has no organization ancestor and its activity carries no organizationId. Before the
    // fix, batching ≥2 user rows (e.g. seeding) called resolveChannelKey and threw
    // "the hierarchy model requires an organization ancestor". Non-product entities have no seq
    // context and must group by org (here 'none'), like resources.
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
    expect(log.error).not.toHaveBeenCalled();
  });

  it('handles single-event batch without error', () => {
    const events = [mockBatchEvent(42)];
    sendBatchMessageToApi(events, { traceId: 'test', spanId: 'test' } as never);

    expect(wsClient.send).toHaveBeenCalledOnce();
    expect(log.error).not.toHaveBeenCalled();
  });

  it('handles events without seqs (delete batches)', () => {
    const events = [mockBatchEvent(1), mockBatchEvent(2)].map((e) => ({ ...e, seq: undefined }));
    // Override action to delete
    for (const e of events) (e.activity as Record<string, unknown>).action = 'delete';

    sendBatchMessageToApi(events, { traceId: 'test', spanId: 'test' } as never);

    expect(wsClient.send).toHaveBeenCalledOnce();
    const payload = vi.mocked(wsClient.send).mock.calls[0][0] as Record<string, unknown>;
    const activity = payload.activity as Record<string, unknown>;
    expect(activity.batchUntilSeq).toBeUndefined();
    expect(activity.action).toBe('delete');
    expect(activity.deletedIds).toBeUndefined();
    expect(log.error).not.toHaveBeenCalled();
  });
});
