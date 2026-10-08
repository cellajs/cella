import { RESOURCE_LIMITS } from '../constants';
import { log } from '../lib/pino';
import type { PendingEvent } from '../types';
import { metrics } from './cdc-metrics';

const { flushBatchSize, flushMaxEvents } = RESOURCE_LIMITS.buffers;

/**
 * Cross-transaction micro-batching: collects the surviving events of committed source transactions and hands them to
 * `processFlush` in commit order, amortizing database round trips across independent single-row commits. A flush takes
 * whole source transactions, up to `maxEvents` (a larger one goes alone), and its position is acknowledged only after
 * `processFlush` resolved. windowMs 0 flushes immediately.
 *
 * A flush that rejects acknowledges nothing: the buffer drops what it holds, refuses new events and calls `onFailed`,
 * so the worker reads again from the last acknowledged position.
 */
export class FlushBuffer {
  /** Source transactions in commit order, each with its surviving events. */
  private pending: PendingEvent[][] = [];
  private pendingCount = 0;
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  /** The flush in progress: a second caller waits for it and then takes what is still pending. */
  private flushing: Promise<void> | null = null;
  private failed = false;

  private processFlush: (transactions: PendingEvent[][]) => Promise<void>;
  private acknowledgeLsn: (lsn: string) => Promise<void>;
  private windowMs: number;
  private batchSize: number;
  private maxEvents: number;

  /** Called after a flush that left nothing pending. */
  onDrained: (() => void) | null = null;

  /** Called once when a flush rejected; the buffer stays closed until `reset`. */
  onFailed: ((error: unknown) => void) | null = null;

  constructor(
    processFlush: (transactions: PendingEvent[][]) => Promise<void>,
    acknowledgeLsn: (lsn: string) => Promise<void>,
    windowMs: number,
    { batchSize = flushBatchSize, maxEvents = flushMaxEvents }: { batchSize?: number; maxEvents?: number } = {},
  ) {
    this.processFlush = processFlush;
    this.acknowledgeLsn = acknowledgeLsn;
    this.windowMs = windowMs;
    this.batchSize = batchSize;
    this.maxEvents = maxEvents;
  }

  /**
   * Takes the surviving events of one committed source transaction. Resolves at once below the batch size; at or above
   * it only after the pending events are flushed, which holds the replication stream while the worker is behind.
   */
  async enqueue(events: PendingEvent[]): Promise<void> {
    if (events.length === 0 || this.failed) return;

    this.pending.push(events);
    this.pendingCount += events.length;

    if (this.windowMs === 0 || this.pendingCount >= this.batchSize) {
      await this.flush();
      return;
    }

    // Timer fallback for low-traffic periods.
    if (!this.flushTimer) {
      this.flushTimer = setTimeout(() => {
        this.flushTimer = null;
        void this.flush();
      }, this.windowMs);
    }
  }

  /** Flushes until nothing is pending. */
  async flush(): Promise<void> {
    this.clearTimer();
    while (this.flushing) await this.flushing;
    if (this.pendingCount === 0 || this.failed) return;

    this.flushing = this.drainPending().finally(() => {
      this.flushing = null;
    });
    await this.flushing;
  }

  private async drainPending(): Promise<void> {
    while (this.pendingCount > 0) {
      const transactions = this.takeTransactions();
      const events = transactions.reduce((count, transaction) => count + transaction.length, 0);
      const lastTransaction = transactions[transactions.length - 1];
      const lsn = lastTransaction[lastTransaction.length - 1].lsn;
      const flushStart = performance.now();

      try {
        await this.processFlush(transactions);
      } catch (error) {
        this.failed = true;
        this.pending = [];
        this.pendingCount = 0;
        log.error('Flush failed: position not acknowledged, reading again from the last acknowledged one', {
          err: error,
          events,
          firstLsn: transactions[0][0].lsn,
        });
        this.onFailed?.(error);
        return;
      }

      // The last event of the flush implicitly acknowledges all prior ones.
      await this.acknowledgeLsn(lsn);
      metrics.recordFlush(events, performance.now() - flushStart);
    }

    this.onDrained?.();
  }

  /** Whole source transactions from the front, up to `maxEvents`; always at least one. */
  private takeTransactions(): PendingEvent[][] {
    const taken: PendingEvent[][] = [];
    let count = 0;
    while (this.pending.length > 0 && (taken.length === 0 || count + this.pending[0].length <= this.maxEvents)) {
      const transaction = this.pending.shift() as PendingEvent[];
      taken.push(transaction);
      count += transaction.length;
    }
    this.pendingCount -= count;
    return taken;
  }

  /** Graceful shutdown: flushes any remaining events immediately. */
  async drain(): Promise<void> {
    await this.flush();
  }

  /** Forgets what is pending and opens the buffer again: the replication stream starts over from the acknowledged position. */
  reset(): void {
    this.clearTimer();
    this.pending = [];
    this.pendingCount = 0;
    this.failed = false;
  }

  /** Number of events currently buffered. */
  get size(): number {
    return this.pendingCount;
  }

  /** True when nothing is buffered and no flush is in flight. */
  get isIdle(): boolean {
    return this.pendingCount === 0 && !this.flushing;
  }

  private clearTimer(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
  }
}
