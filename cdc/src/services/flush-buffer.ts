import { RESOURCE_LIMITS } from '../constants';
import { log } from '../lib/pino';
import type { PendingEvent } from '../types';
import { metrics } from './cdc-metrics';

/**
 * Cross-transaction micro-batching: accumulates surviving events from committed transactions and
 * flushes them grouped by (tableMeta.type, action), amortizing DB roundtrips across independent
 * single-row commits. windowMs 0 flushes immediately.
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

  async enqueue(events: PendingEvent[]): Promise<void> {
    for (const event of events) {
      this.pending.push(event);
      this.highestLsn = event.lsn;
    }

    if (this.windowMs === 0) {
      await this.flush();
      return;
    }

    if (this.pending.length >= this.batchSize) {
      await this.flush();
      return;
    }

    // Safety cap.
    if (this.pending.length >= RESOURCE_LIMITS.buffers.maxBufferedEvents) {
      log.trace('Flush buffer hit size cap, flushing immediately', {
        count: this.pending.length,
      });
      await this.flush();
      return;
    }

    // Timer fallback for low-traffic periods.
    if (!this.flushTimer) {
      this.flushTimer = setTimeout(() => {
        this.flushTimer = null;
        this.flush();
      }, this.windowMs);
    }
  }

  /** Groups by (type, action), processes each group, then acknowledges the highest LSN. */
  async flush(): Promise<void> {
    // Re-entrancy guard.
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

      // The highest LSN implicitly acknowledges all prior ones.
      await this.acknowledgeLsn(lsn);

      metrics.recordFlush(events.length, performance.now() - flushStart);

      if (events.length > 1) {
        log.trace('Flush buffer batch processed', {
          totalEvents: events.length,
          groups: groups.size,
        });
      }
    } finally {
      this.flushing = false;

      // Events that accumulated during this flush.
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

  /** Graceful shutdown: flushes any remaining events immediately. */
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
