import type { PendingEvent } from '../types';
import { log } from '../lib/pino';
import { RESOURCE_LIMITS } from '../constants';
import { cdcMetrics } from './cdc-metrics';

/**
 * Cross-transaction micro-batching buffer.
 *
 * Accumulates surviving events (post-cascade-analysis) from multiple committed
 * transactions, then flushes them as merged groups after a configurable window.
 *
 * When windowMs is 0, events are processed immediately (current behavior).
 * When windowMs > 0, events accumulate for up to windowMs before flushing,
 * amortizing DB roundtrips across independent single-row commits.
 *
 * Grouping uses tableMeta.type (works for both entities and resources)
 * combined with action.
 */
export class FlushBuffer {
  private pending: PendingEvent[] = [];
  private highestLsn: string | null = null;
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private flushing = false;

  private processEvents: (events: PendingEvent[]) => Promise<void>;
  private acknowledgeLsn: (lsn: string) => Promise<void>;
  private windowMs: number;
  private batchSize: number;

  constructor(
    processEvents: (events: PendingEvent[]) => Promise<void>,
    acknowledgeLsn: (lsn: string) => Promise<void>,
    windowMs: number,
    batchSize = RESOURCE_LIMITS.buffers.flushBatchSize,
  ) {
    this.processEvents = processEvents;
    this.acknowledgeLsn = acknowledgeLsn;
    this.windowMs = windowMs;
    this.batchSize = batchSize;
  }

  /**
   * Enqueue surviving events from a committed transaction.
   * If windowMs is 0, flushes immediately. Otherwise starts/extends the flush timer.
   */
  async enqueue(events: PendingEvent[]): Promise<void> {
    for (const event of events) {
      this.pending.push(event);
      this.highestLsn = event.lsn;
    }

    // Immediate mode: no micro-batching
    if (this.windowMs === 0) {
      await this.flush();
      return;
    }

    // Batch size reached — flush immediately
    if (this.pending.length >= this.batchSize) {
      await this.flush();
      return;
    }

    // Safety cap
    if (this.pending.length >= RESOURCE_LIMITS.buffers.maxBufferedEvents) {
      log.trace('Flush buffer hit size cap, flushing immediately', {
        count: this.pending.length,
      });
      await this.flush();
      return;
    }

    // Start timer as fallback for low-traffic periods
    if (!this.flushTimer) {
      this.flushTimer = setTimeout(() => {
        this.flushTimer = null;
        this.flush();
      }, this.windowMs);
    }
  }

  /**
   * Flush all buffered events: group by (type, action),
   * process each group, then acknowledge the highest LSN.
   */
  async flush(): Promise<void> {
    // Prevent re-entrant flushes
    if (this.flushing) return;

    this.clearTimer();

    const events = this.pending;
    const lsn = this.highestLsn;
    this.pending = [];
    this.highestLsn = null;

    if (events.length === 0 || !lsn) return;

    this.flushing = true;
    const flushStart = performance.now();
    try {
      // Group by (type, action) — merges events across transactions
      const groups = new Map<string, PendingEvent[]>();
      for (const event of events) {
        const type = event.result.tableMeta.type;
        const action = event.result.activity.action;
        const key = `${type}:${action}`;
        const group = groups.get(key);
        if (group) group.push(event);
        else groups.set(key, [event]);
      }

      const results = await Promise.allSettled(
        [...groups.values()].map((groupEvents) => this.processEvents(groupEvents)),
      );

      for (const result of results) {
        if (result.status === 'rejected') {
          log.error('Group processing failed', { err: result.reason });
        }
      }

      // Ack the highest LSN — implicitly covers all prior LSNs
      await this.acknowledgeLsn(lsn);

      cdcMetrics.recordFlush(events.length, performance.now() - flushStart);

      if (events.length > 1) {
        log.trace('Flush buffer batch processed', {
          totalEvents: events.length,
          groups: groups.size,
        });
      }
    } finally {
      this.flushing = false;

      // Re-flush if events accumulated during the previous flush
      if (this.pending.length > 0) {
        if (this.windowMs === 0 || this.pending.length >= this.batchSize) {
          this.flush();
        } else if (!this.flushTimer) {
          this.flushTimer = setTimeout(() => {
            this.flushTimer = null;
            this.flush();
          }, this.windowMs);
        }
      }
    }
  }

  /** Flush any remaining events immediately (for graceful shutdown). */
  async drain(): Promise<void> {
    this.clearTimer();
    await this.flush();
  }

  /** Number of events currently buffered. */
  get size(): number {
    return this.pending.length;
  }

  private clearTimer(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
  }
}
