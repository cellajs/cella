import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FlushBuffer } from '../services/flush-buffer';
import type { PendingEvent } from '../types';
import { mockPendingEvent } from './factories';

/** A source transaction of `count` changes whose positions start at `first`; `commitLsn` is where it committed. */
const transaction = (first: number, count = 1, commitLsn?: string): PendingEvent[] =>
  Array.from({ length: count }, (_, i) => ({ ...mockPendingEvent({ lsn: `0/${(first + i).toString(16).toUpperCase()}` }), commitLsn }));

const lsnsOf = (transactions: PendingEvent[][]) => transactions.map((events) => events.map((event) => event.lsn));

/** A `processFlush` that holds every flush until the test releases it. */
const heldFlushes = (flushes: PendingEvent[][][]) => {
  const releases: (() => void)[] = [];
  const failures: ((error: Error) => void)[] = [];
  const processFlush = vi.fn(
    (transactions: PendingEvent[][]) =>
      new Promise<void>((resolve, reject) => {
        flushes.push(transactions);
        releases.push(resolve);
        failures.push(reject);
      }),
  );
  return { processFlush, releases, failures };
};

describe('FlushBuffer', () => {
  let flushes: PendingEvent[][][];
  let acknowledged: string[];
  let processFlush: (transactions: PendingEvent[][]) => Promise<void>;
  let acknowledge: (position: string) => Promise<void>;

  beforeEach(() => {
    vi.useFakeTimers();
    flushes = [];
    acknowledged = [];
    processFlush = vi.fn(async (transactions: PendingEvent[][]) => {
      flushes.push(transactions);
    });
    acknowledge = vi.fn(async (position: string) => {
      acknowledged.push(position);
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('at the batch size', () => {
    it('flushes each source transaction as it arrives when one change fills a batch', async () => {
      const buffer = new FlushBuffer(processFlush, acknowledge, 10, 1);

      await buffer.enqueue(transaction(1, 2));
      await buffer.enqueue(transaction(3));

      expect(lsnsOf(flushes[0])).toEqual([['0/1', '0/2']]);
      expect(lsnsOf(flushes[1])).toEqual([['0/3']]);
      expect(acknowledged).toEqual(['0/2', '0/3']);
    });

    it('ignores a source transaction without surviving changes', async () => {
      const buffer = new FlushBuffer(processFlush, acknowledge, 10, 1);
      await buffer.enqueue([]);
      expect(processFlush).not.toHaveBeenCalled();
      expect(acknowledge).not.toHaveBeenCalled();
    });

    it('holds the caller once a batch is pending, until it is flushed', async () => {
      const held = heldFlushes(flushes);
      const buffer = new FlushBuffer(held.processFlush, acknowledge, 10, 3);

      await buffer.enqueue(transaction(1, 2));
      let resolved = false;
      const caller = buffer.enqueue(transaction(3)).then(() => {
        resolved = true;
      });
      await vi.advanceTimersByTimeAsync(0);

      expect(flushes).toHaveLength(1);
      expect(resolved).toBe(false);

      held.releases[0]();
      await caller;
      expect(resolved).toBe(true);
      expect(acknowledged).toEqual(['0/3']);
    });
  });

  describe('within the window', () => {
    it('collects source transactions for the window and flushes them together, in commit order', async () => {
      const buffer = new FlushBuffer(processFlush, acknowledge, 10);

      await buffer.enqueue(transaction(1));
      await buffer.enqueue(transaction(2, 2));
      expect(processFlush).not.toHaveBeenCalled();
      expect(buffer.isIdle).toBe(false);

      await vi.advanceTimersByTimeAsync(10);

      expect(flushes).toHaveLength(1);
      expect(lsnsOf(flushes[0])).toEqual([['0/1'], ['0/2', '0/3']]);
      expect(acknowledged).toEqual(['0/3']);
      expect(buffer.isIdle).toBe(true);
    });

    it('takes everything that is pending in one flush, whole source transactions only', async () => {
      const buffer = new FlushBuffer(processFlush, acknowledge, 10, 1000);

      await buffer.enqueue(transaction(1, 2));
      await buffer.enqueue(transaction(3, 600));
      await buffer.enqueue(transaction(700, 1));
      await vi.advanceTimersByTimeAsync(10);

      expect(flushes.map((transactions) => transactions.map((events) => events.length))).toEqual([[2, 600, 1]]);
    });

    it('acknowledges the commit position of its last source transaction, not the position of its last change', async () => {
      const buffer = new FlushBuffer(processFlush, acknowledge, 10);

      // Two source transactions in one flush. The commit record of each lies after its last change.
      await buffer.enqueue(transaction(1, 2, '0/50'));
      await buffer.enqueue(transaction(3, 2, '0/90'));
      await vi.advanceTimersByTimeAsync(10);

      // 0/4, the last change, lies before the commit at 0/90: acknowledging it would leave the second
      // transaction to be delivered again.
      expect(acknowledged).toEqual(['0/90']);
    });

    it('runs one flush at a time: what arrives meanwhile goes into the next, in order', async () => {
      const held = heldFlushes(flushes);
      const buffer = new FlushBuffer(held.processFlush, acknowledge, 10);

      await buffer.enqueue(transaction(1));
      await vi.advanceTimersByTimeAsync(10);
      await buffer.enqueue(transaction(2));
      await buffer.enqueue(transaction(3));
      await vi.advanceTimersByTimeAsync(10);
      expect(flushes).toHaveLength(1);

      held.releases[0]();
      await vi.advanceTimersByTimeAsync(0);
      expect(lsnsOf(flushes[1])).toEqual([['0/2'], ['0/3']]);
      expect(acknowledged).toEqual(['0/1']);

      held.releases[1]();
      await vi.advanceTimersByTimeAsync(0);
      expect(acknowledged).toEqual(['0/1', '0/3']);
    });

    it('reports when a flush left nothing pending', async () => {
      const buffer = new FlushBuffer(processFlush, acknowledge, 10);
      const onDrained = vi.fn();
      buffer.onDrained = onDrained;

      await buffer.enqueue(transaction(1));
      await buffer.flush();

      expect(onDrained).toHaveBeenCalledOnce();
    });
  });

  describe('a flush that fails', () => {
    it('acknowledges nothing, drops what is pending and reports the failure once', async () => {
      const held = heldFlushes(flushes);
      const buffer = new FlushBuffer(held.processFlush, acknowledge, 10);
      const onFailed = vi.fn();
      buffer.onFailed = onFailed;

      await buffer.enqueue(transaction(1));
      await vi.advanceTimersByTimeAsync(10);
      // Arrives while the first flush runs, and waits for the next.
      await buffer.enqueue(transaction(2));
      const failure = new Error('constraint violated');
      held.failures[0](failure);
      await vi.advanceTimersByTimeAsync(10);

      expect(held.processFlush).toHaveBeenCalledOnce();
      expect(acknowledge).not.toHaveBeenCalled();
      expect(onFailed).toHaveBeenCalledExactlyOnceWith(failure, '0/1');
      expect(buffer.failed).toBe(true);
      expect(buffer.isIdle).toBe(true);
    });

    it('fails the same way for a message that never reached a flush, and once only', async () => {
      const buffer = new FlushBuffer(processFlush, acknowledge, 10);
      const onFailed = vi.fn();
      buffer.onFailed = onFailed;
      await buffer.enqueue(transaction(1));

      const failure = new Error('unreadable message');
      buffer.fail(failure, '0/7');
      buffer.fail(new Error('a second one'), '0/8');
      await vi.advanceTimersByTimeAsync(10);

      expect(onFailed).toHaveBeenCalledExactlyOnceWith(failure, '0/7');
      expect(processFlush).not.toHaveBeenCalled();
      expect(acknowledge).not.toHaveBeenCalled();
    });

    it('takes no changes until it is reset: they are read again from the acknowledged position', async () => {
      let fail = true;
      processFlush = vi.fn(async (transactions: PendingEvent[][]) => {
        if (fail) throw new Error('down');
        flushes.push(transactions);
      });
      const buffer = new FlushBuffer(processFlush, acknowledge, 10, 1);

      await buffer.enqueue(transaction(1));
      await buffer.enqueue(transaction(2));
      expect(processFlush).toHaveBeenCalledOnce();
      expect(acknowledge).not.toHaveBeenCalled();

      fail = false;
      await buffer.reset();
      expect(buffer.failed).toBe(false);
      expect(buffer.isIdle).toBe(true);
      await buffer.enqueue(transaction(1));

      expect(lsnsOf(flushes[0])).toEqual([['0/1']]);
      expect(acknowledged).toEqual(['0/1']);
    });
  });

  describe('a reset before a new subscription', () => {
    it('must not resolve while a flush is in flight, and must not flush what was pending behind it', async () => {
      const held = heldFlushes(flushes);
      const buffer = new FlushBuffer(held.processFlush, acknowledge, 10);

      await buffer.enqueue(transaction(1));
      await vi.advanceTimersByTimeAsync(10);
      // Pending behind the flush in flight: its window would flush it next.
      await buffer.enqueue(transaction(2));

      let reset = false;
      const resetting = buffer.reset().then(() => {
        reset = true;
      });
      await vi.advanceTimersByTimeAsync(50);
      // The flush of the subscription that ended is still recording: a rebuild must not start beside it.
      expect(reset).toBe(false);

      held.releases[0]();
      await resetting;
      await vi.advanceTimersByTimeAsync(50);

      expect(reset).toBe(true);
      expect(held.processFlush).toHaveBeenCalledOnce();
      expect(lsnsOf(flushes[0])).toEqual([['0/1']]);
      expect(buffer.isIdle).toBe(true);
    });

    it('waits for a flush in flight that fails, and opens the buffer after it', async () => {
      const held = heldFlushes(flushes);
      const buffer = new FlushBuffer(held.processFlush, acknowledge, 10);
      const onFailed = vi.fn();
      buffer.onFailed = onFailed;

      await buffer.enqueue(transaction(1));
      await vi.advanceTimersByTimeAsync(10);
      const resetting = buffer.reset();
      held.failures[0](new Error('connection lost'));
      await resetting;

      // The failure is reported, and the buffer takes the changes of the next subscription.
      expect(onFailed).toHaveBeenCalledOnce();
      expect(buffer.failed).toBe(false);
      await buffer.enqueue(transaction(1));
      await vi.advanceTimersByTimeAsync(10);
      expect(flushes).toHaveLength(2);
    });

    it('waits for what runs between two flushes', async () => {
      const buffer = new FlushBuffer(processFlush, acknowledge, 10);
      let release: () => void = () => {};
      void buffer.exclusive(
        () =>
          new Promise<void>((resolve) => {
            release = resolve;
          }),
      );

      let reset = false;
      const resetting = buffer.reset().then(() => {
        reset = true;
      });
      await vi.advanceTimersByTimeAsync(10);
      expect(reset).toBe(false);

      release();
      await resetting;
      expect(reset).toBe(true);
    });
  });
});
