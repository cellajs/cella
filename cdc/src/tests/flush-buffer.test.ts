import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mockPendingEvent } from './factories';

// Mock cdc-metrics to avoid db/env import chain
vi.mock('../services/cdc-metrics', () => ({
  cdcMetrics: { recordFlush: vi.fn() },
}));

import { FlushBuffer } from '../services/flush-buffer';
import type { PendingEvent } from '../types';

describe('FlushBuffer', () => {
  let processedBatches: PendingEvent[][];
  let acknowledgedLsns: string[];
  let processEvents: (events: PendingEvent[]) => Promise<void>;
  let acknowledgeLsn: (lsn: string) => Promise<void>;

  beforeEach(() => {
    vi.useFakeTimers();
    processedBatches = [];
    acknowledgedLsns = [];

    processEvents = vi.fn(async (events: PendingEvent[]) => {
      processedBatches.push([...events]);
    });

    acknowledgeLsn = vi.fn(async (lsn: string) => {
      acknowledgedLsns.push(lsn);
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('immediate mode (windowMs=0)', () => {
    it('flushes events immediately without buffering', async () => {
      const buffer = new FlushBuffer(processEvents, acknowledgeLsn, 0);

      const e1 = mockPendingEvent({ lsn: '0/1', action: 'create', entityType: 'attachment' });
      await buffer.enqueue([e1]);

      expect(processedBatches).toHaveLength(1);
      expect(processedBatches[0]).toHaveLength(1);
      expect(acknowledgedLsns).toEqual(['0/1']);
    });

    it('processes each enqueue independently', async () => {
      const buffer = new FlushBuffer(processEvents, acknowledgeLsn, 0);

      const e1 = mockPendingEvent({ lsn: '0/1', action: 'create', entityType: 'attachment' });
      const e2 = mockPendingEvent({ lsn: '0/2', action: 'update', entityType: 'attachment' });

      await buffer.enqueue([e1]);
      await buffer.enqueue([e2]);

      expect(processedBatches).toHaveLength(2);
      expect(acknowledgedLsns).toEqual(['0/1', '0/2']);
    });
  });

  describe('micro-batching mode (windowMs>0)', () => {
    it('buffers events and flushes after the window', async () => {
      const buffer = new FlushBuffer(processEvents, acknowledgeLsn, 10);

      const e1 = mockPendingEvent({ lsn: '0/1', action: 'create', entityType: 'attachment' });
      await buffer.enqueue([e1]);

      // Not flushed yet
      expect(processedBatches).toHaveLength(0);
      expect(buffer.size).toBe(1);

      // Advance timer
      await vi.advanceTimersByTimeAsync(10);

      expect(processedBatches).toHaveLength(1);
      expect(acknowledgedLsns).toEqual(['0/1']);
      expect(buffer.size).toBe(0);
    });

    it('merges events from multiple enqueue calls into one flush', async () => {
      const buffer = new FlushBuffer(processEvents, acknowledgeLsn, 10);

      const e1 = mockPendingEvent({ lsn: '0/1', action: 'create', entityType: 'attachment' });
      const e2 = mockPendingEvent({ lsn: '0/2', action: 'create', entityType: 'attachment' });

      await buffer.enqueue([e1]);
      await buffer.enqueue([e2]);

      expect(processedBatches).toHaveLength(0);

      await vi.advanceTimersByTimeAsync(10);

      // Both events in same group (same type:action:channelId)
      expect(processedBatches).toHaveLength(1);
      expect(processedBatches[0]).toHaveLength(2);
      expect(acknowledgedLsns).toEqual(['0/2']);
    });

    it('groups events by type and action', async () => {
      const buffer = new FlushBuffer(processEvents, acknowledgeLsn, 10);

      // Two attachment creates
      const e1 = mockPendingEvent({ lsn: '0/1', action: 'create', entityType: 'attachment' });
      const e2 = mockPendingEvent({ lsn: '0/2', action: 'create', entityType: 'attachment' });
      // One user create (different type)
      const e3 = mockPendingEvent({ lsn: '0/3', action: 'create', entityType: 'user' });
      // One more attachment create (same type:action group)
      const e4 = mockPendingEvent({ lsn: '0/4', action: 'create', entityType: 'attachment' });

      await buffer.enqueue([e1, e2, e3, e4]);

      await vi.advanceTimersByTimeAsync(10);

      // 2 groups: attachment:create (3 events), user:create (1 event)
      expect(processedBatches).toHaveLength(2);
      // Only one ack for the highest LSN
      expect(acknowledgedLsns).toEqual(['0/4']);
    });

    it('handles resource types in grouping', async () => {
      const buffer = new FlushBuffer(processEvents, acknowledgeLsn, 10);

      const e1 = mockPendingEvent({ lsn: '0/1', action: 'create', resourceType: 'membership', entityType: null, organizationId: 'org-1', tableMeta: 'resource' });
      const e2 = mockPendingEvent({ lsn: '0/2', action: 'create', resourceType: 'membership', entityType: null, organizationId: 'org-1', tableMeta: 'resource' });

      await buffer.enqueue([e1, e2]);

      await vi.advanceTimersByTimeAsync(10);

      // Same group: membership:create:org-1
      expect(processedBatches).toHaveLength(1);
      expect(processedBatches[0]).toHaveLength(2);
    });
  });

  describe('drain', () => {
    it('flushes pending events immediately on drain', async () => {
      const buffer = new FlushBuffer(processEvents, acknowledgeLsn, 10);

      const e1 = mockPendingEvent({ lsn: '0/1', action: 'create', entityType: 'attachment' });
      await buffer.enqueue([e1]);

      expect(processedBatches).toHaveLength(0);

      await buffer.drain();

      expect(processedBatches).toHaveLength(1);
      expect(acknowledgedLsns).toEqual(['0/1']);
      expect(buffer.size).toBe(0);
    });

    it('is safe to call when empty', async () => {
      const buffer = new FlushBuffer(processEvents, acknowledgeLsn, 10);
      await buffer.drain();

      expect(processedBatches).toHaveLength(0);
      expect(acknowledgedLsns).toHaveLength(0);
    });
  });

  describe('edge cases', () => {
    it('handles empty enqueue', async () => {
      const buffer = new FlushBuffer(processEvents, acknowledgeLsn, 0);
      await buffer.enqueue([]);

      // No events → flush is a no-op
      expect(processedBatches).toHaveLength(0);
      expect(acknowledgedLsns).toHaveLength(0);
    });

    it('acknowledges the highest LSN in a merged batch', async () => {
      const buffer = new FlushBuffer(processEvents, acknowledgeLsn, 10);

      await buffer.enqueue([mockPendingEvent({ lsn: '0/5', action: 'create', entityType: 'attachment' })]);
      await buffer.enqueue([mockPendingEvent({ lsn: '0/10', action: 'create', entityType: 'attachment' })]);
      await buffer.enqueue([mockPendingEvent({ lsn: '0/3', action: 'create', entityType: 'attachment' })]);

      await vi.advanceTimersByTimeAsync(10);

      // Should ack the last-enqueued LSN (0/3) since it's the highest seen
      // (monotonic from WAL: events arrive in order)
      expect(acknowledgedLsns).toEqual(['0/3']);
    });
  });
});
