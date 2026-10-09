import { RESOURCE_LIMITS } from '../constants';
import { log } from '../lib/pino';
import type { PendingEvent } from '../types';

/**
 * Collects the surviving changes of committed source transactions and hands them to `processFlush` in commit order,
 * so one database transaction records many independent single-row commits. A flush takes every whole source
 * transaction that is pending, and its position is acknowledged only after `processFlush` resolved.
 *
 * A flush that rejects acknowledges nothing: the buffer drops what it holds, refuses new changes and calls `onFailed`,
 * so the worker reads again from the last acknowledged position. That is the one way a failure is handled: nothing is
 * retried in place and nothing is left out.
 */
export class FlushBuffer {
  /** Source transactions in commit order, each with its surviving changes. */
  private pending: PendingEvent[][] = [];
  private pendingCount = 0;
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  /**
   * Settles when the last flush or run that was asked for has ended. Each takes its turn after the one asked for
   * before it, so a run between two flushes gets the next gap, also while changes keep arriving.
   */
  private turn: Promise<void> = Promise.resolve();
  /** Flushes and runs that are in progress or wait for their turn. */
  private turns = 0;
  private closedByFailure = false;

  private processFlush: (transactions: PendingEvent[][]) => Promise<void>;
  private acknowledge: (position: string) => Promise<void>;
  private windowMs: number;
  private batchSize: number;

  /** Called after a flush that left nothing pending. */
  onDrained: (() => void) | null = null;

  /** Called once when a flush rejected, with the position of its first change; the buffer stays closed until `reset`. */
  onFailed: ((error: unknown, position: string) => void) | null = null;

  /**
   * @param processFlush - Records the changes of whole source transactions and hands them to the API.
   * @param acknowledge - Called after every flush that was recorded, with the commit position of its last source transaction.
   * @param windowMs - How long the first pending change waits for more before it is flushed.
   * @param batchSize - Pending changes from which a flush starts at once and the caller is held.
   */
  constructor(
    processFlush: (transactions: PendingEvent[][]) => Promise<void>,
    acknowledge: (position: string) => Promise<void>,
    windowMs: number,
    batchSize: number = RESOURCE_LIMITS.buffers.flushBatchSize,
  ) {
    this.processFlush = processFlush;
    this.acknowledge = acknowledge;
    this.windowMs = windowMs;
    this.batchSize = batchSize;
  }

  /**
   * Takes the surviving changes of one committed source transaction. Resolves at once below the batch size; at or above
   * it only after the pending changes are flushed, which holds the replication stream while the worker is behind.
   */
  async enqueue(events: PendingEvent[]): Promise<void> {
    if (events.length === 0 || this.closedByFailure) return;

    this.pending.push(events);
    this.pendingCount += events.length;

    if (this.pendingCount >= this.batchSize) {
      await this.flush();
      return;
    }

    // In quiet times the window ends the wait.
    if (!this.flushTimer) {
      this.flushTimer = setTimeout(() => {
        this.flushTimer = null;
        void this.flush();
      }, this.windowMs);
    }
  }

  /**
   * Flushes what is pending: resolves once every change that was pending at the call is recorded. What arrives
   * meanwhile goes into a flush of its own, which starts right after whatever waits for the gap between the two.
   */
  async flush(): Promise<void> {
    this.clearTimer();
    await this.inTurn(() => this.flushPending());
  }

  private async flushPending(): Promise<void> {
    if (this.pendingCount === 0 || this.closedByFailure) return;

    const transactions = this.pending;
    const events = this.pendingCount;
    this.pending = [];
    this.pendingCount = 0;

    try {
      await this.processFlush(transactions);
    } catch (error) {
      this.fail(error, transactions[0][0].lsn, events);
      return;
    }

    // The commit of the last source transaction: everything up to it is recorded. A change's own position lies
    // before that commit, and would leave its transaction to be delivered again.
    const last = transactions[transactions.length - 1].at(-1) as PendingEvent;
    await this.acknowledge(last.commitLsn ?? last.lsn);

    if (this.pendingCount > 0) void this.flush();
    else this.onDrained?.();
  }

  /**
   * Runs `fn` while no flush is in progress and holds the next flush until it resolved: what `fn` reads sits exactly
   * between two flushes. It takes the gap after the flush in progress, however many changes are pending by then.
   * Changes keep arriving meanwhile and are flushed after it.
   */
  async exclusive<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await this.inTurn(fn);
    } finally {
      if (this.pendingCount > 0) void this.flush();
    }
  }

  /** Runs `task` once every flush and run that was asked for before it has ended, whatever their outcome. */
  private inTurn<T>(task: () => Promise<T>): Promise<T> {
    this.turns += 1;
    const run = this.turn.then(task);
    const ended = () => {
      this.turns -= 1;
    };
    this.turn = run.then(ended, ended);
    return run;
  }

  /**
   * Closes the buffer on a failure: of a flush, or of a message that could not be handled before it reached one. What
   * is pending is dropped, because the stream is read again from the last acknowledged position.
   * @param error - What failed.
   * @param position - The position the failure belongs to: a failed flush's first change.
   * @param events - How many changes the failed flush held.
   */
  fail(error: unknown, position: string, events = 0): void {
    if (this.closedByFailure) return;
    this.closedByFailure = true;
    this.dropPending();
    log.error('Flush failed: position not acknowledged, reading again from the last acknowledged one', { err: error, events, position });
    this.onFailed?.(error, position);
  }

  /**
   * Before a new subscription: drops what is pending, waits for the flush in flight to end, whatever its outcome, and
   * opens the buffer again. The stream starts over from the acknowledged position, so what is dropped is delivered
   * again, and nothing of the subscription that ended is still being recorded when this resolves.
   */
  async reset(): Promise<void> {
    this.dropPending();
    while (this.turns > 0) await this.turn;
    this.dropPending();
    this.closedByFailure = false;
  }

  /** True from a failure until `reset`: nothing is taken, flushed or to be acknowledged meanwhile. */
  get failed(): boolean {
    return this.closedByFailure;
  }

  /** True when nothing is buffered and no flush is in flight. */
  get isIdle(): boolean {
    return this.pendingCount === 0 && this.turns === 0;
  }

  private dropPending(): void {
    this.clearTimer();
    this.pending = [];
    this.pendingCount = 0;
  }

  private clearTimer(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
  }
}
