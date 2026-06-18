import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockBatchEvent } from './factories';

// Mock dependencies before importing the module under test
vi.mock('../network/websocket-client', () => ({
  wsClient: { send: vi.fn(() => true) },
}));
vi.mock('shared/nanoid', () => ({
  nanoid: () => 'mock-token',
  nanoidTenant: () => 'mock-t',
}));

import { generateActivityId, sendBatchMessageToApi } from '../services/activity-service';
import { wsClient } from '../network/websocket-client';
import { logEvent } from '../lib/pino';

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
    expect(logEvent).not.toHaveBeenCalledWith('error', expect.any(String), expect.any(Object));
  });

  it('logs error for non-contiguous seqs (gap detection invariant)', () => {
    // seq 10, 12 — gap at 11
    const events = [mockBatchEvent(10), mockBatchEvent(12)];
    sendBatchMessageToApi(events, { traceId: 'test', spanId: 'test' } as never);

    expect(logEvent).toHaveBeenCalledWith(
      'error',
      'Non-contiguous seqs in batch — sync integrity at risk',
      expect.objectContaining({ minSeq: 10, batchUntilSeq: 12, seqCount: 2, expected: 3 }),
    );
  });

  it('handles single-event batch without error', () => {
    const events = [mockBatchEvent(42)];
    sendBatchMessageToApi(events, { traceId: 'test', spanId: 'test' } as never);

    expect(wsClient.send).toHaveBeenCalledOnce();
    expect(logEvent).not.toHaveBeenCalledWith('error', expect.any(String), expect.any(Object));
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
    expect(logEvent).not.toHaveBeenCalledWith('error', expect.any(String), expect.any(Object));
  });
});
