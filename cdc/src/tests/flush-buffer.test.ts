import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockPendingEvent } from './factories';

// Mock cdc-metrics to avoid db/env import chain
vi.mock('../services/cdc-metrics', () => ({ metrics: { recordFlush: vi.fn() } }));

import { FlushBuffer } from '../services/flush-buffer';
import type { PendingEvent } from '../types';

/** A source transaction of `count` events whose LSNs start at `first`. */
const transaction = (first: number, count = 1): PendingEvent[] =>
  Array.from({ length: count }, (_, i) => mockPendingEvent({ lsn: `0/${(first + i).toString(16).toUpperCase()}` }));

const lsnsOf = (transactions: PendingEvent[][]) => transactions.map((events) => events.map((event) => event.lsn));

describe('FlushBuffer', () => {
  let flushes: PendingEvent[][][];
  let acknowledgedLsns: string[];
  let processFlush: (transactions: PendingEvent[][]) => Promise<void>;
  let acknowledgeLsn: (lsn: string) => Promise<void>;

  beforeEach(() => {
    vi.useFakeTimers();
    flushes = [];
    acknowledgedLsns = [];
    processFlush = vi.fn(async (transactions: PendingEvent[][]) => {
      flushes.push(transactions);
    });
    acknowledgeLsn = vi.fn(async (lsn: string) => {
      acknowledgedLsns.push(lsn);
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('immediate mode (windowMs=0)', () => {
    it('flushes each source transaction as it arrives and acknowledges its last event', async () => {
      const buffer = new FlushBuffer(processFlush, acknowledgeLsn, 0);

      await buffer.enqueue(transaction(1, 2));
      await buffer.enqueue(transaction(3));

      expect(lsnsOf(flushes[0])).toEqual([['0/1', '0/2']]);
      expect(lsnsOf(flushes[1])).toEqual([['0/3']]);
      expect(acknowledgedLsns).toEqual(['0/2', '0/3']);
    });

    it('ignores a source transaction without surviving events', async () => {
      const buffer = new FlushBuffer(processFlush, acknowledgeLsn, 0);
      await buffer.enqueue([]);
      expect(processFlush).not.toHaveBeenCalled();
      expect(acknowledgeLsn).not.toHaveBeenCalled();
    });
  });

  describe('batching', () => {
    it('collects source transactions for the window and flushes them together, in commit order', async () => {
      const buffer = new FlushBuffer(processFlush, acknowledgeLsn, 10);

      await buffer.enqueue(transaction(1));
      await buffer.enqueue(transaction(2, 2));
      expect(processFlush).not.toHaveBeenCalled();
      expect(buffer.size).toBe(3);

      await vi.advanceTimersByTimeAsync(10);

      expect(flushes).toHaveLength(1);
      expect(lsnsOf(flushes[0])).toEqual([['0/1'], ['0/2', '0/3']]);
      expect(acknowledgedLsns).toEqual(['0/3']);
      expect(buffer.isIdle).toBe(true);
    });

    it('holds the caller once a batch is pending, until it is flushed', async () => {
      let release: () => void = () => {};
      processFlush = vi.fn(
        (transactions: PendingEvent[][]) =>
          new Promise<void>((resolve) => {
            flushes.push(transactions);
            release = resolve;
          }),
      );
      const buffer = new FlushBuffer(processFlush, acknowledgeLsn, 10, { batchSize: 3 });

      await buffer.enqueue(transaction(1, 2));
      let resolved = false;
      const held = buffer.enqueue(transaction(3)).then(() => {
        resolved = true;
      });
      await vi.advanceTimersByTimeAsync(0);

      expect(flushes).toHaveLength(1);
      expect(resolved).toBe(false);

      release();
      await held;
      expect(resolved).toBe(true);
      expect(acknowledgedLsns).toEqual(['0/3']);
    });

    it('takes whole source transactions up to the cap, and a larger one alone', async () => {
      const buffer = new FlushBuffer(processFlush, acknowledgeLsn, 10, { batchSize: 100, maxEvents: 4 });

      await buffer.enqueue(transaction(1, 2));
      await buffer.enqueue(transaction(3, 2));
      await buffer.enqueue(transaction(5, 6));
      await buffer.enqueue(transaction(11, 1));
      await vi.advanceTimersByTimeAsync(10);

      expect(flushes.map((transactions) => transactions.map((events) => events.length))).toEqual([[2, 2], [6], [1]]);
      // Each flush acknowledges the last event of its last source transaction, never a position inside one.
      expect(acknowledgedLsns).toEqual(['0/4', '0/A', '0/B']);
    });

    it('runs one flush at a time: what arrives meanwhile goes into the next, in order', async () => {
      const releases: (() => void)[] = [];
      processFlush = vi.fn(
        (transactions: PendingEvent[][]) =>
          new Promise<void>((resolve) => {
            flushes.push(transactions);
            releases.push(resolve);
          }),
      );
      const buffer = new FlushBuffer(processFlush, acknowledgeLsn, 10);

      await buffer.enqueue(transaction(1));
      await vi.advanceTimersByTimeAsync(10);
      await buffer.enqueue(transaction(2));
      await buffer.enqueue(transaction(3));
      await vi.advanceTimersByTimeAsync(10);
      expect(flushes).toHaveLength(1);

      releases[0]();
      await vi.advanceTimersByTimeAsync(0);
      expect(lsnsOf(flushes[1])).toEqual([['0/2'], ['0/3']]);
      expect(acknowledgedLsns).toEqual(['0/1']);

      releases[1]();
      await vi.advanceTimersByTimeAsync(0);
      expect(acknowledgedLsns).toEqual(['0/1', '0/3']);
    });

    it('reports when a flush left nothing pending', async () => {
      const buffer = new FlushBuffer(processFlush, acknowledgeLsn, 10);
      const onDrained = vi.fn();
      buffer.onDrained = onDrained;

      await buffer.enqueue(transaction(1));
      await buffer.drain();

      expect(onDrained).toHaveBeenCalledOnce();
    });
  });

  describe('a flush that fails', () => {
    it('acknowledges nothing, drops what is pending and reports the failure once', async () => {
      const failure = new Error('constraint violated');
      processFlush = vi.fn(async () => {
        throw failure;
      });
      const buffer = new FlushBuffer(processFlush, acknowledgeLsn, 10, { maxEvents: 1 });
      const onFailed = vi.fn();
      buffer.onFailed = onFailed;

      await buffer.enqueue(transaction(1));
      await buffer.enqueue(transaction(2));
      await vi.advanceTimersByTimeAsync(10);

      expect(processFlush).toHaveBeenCalledOnce();
      expect(acknowledgeLsn).not.toHaveBeenCalled();
      expect(onFailed).toHaveBeenCalledExactlyOnceWith(failure, '0/1');
      expect(buffer.size).toBe(0);
    });

    it('fails the same way for a message that never reached a flush, and once only', async () => {
      const buffer = new FlushBuffer(processFlush, acknowledgeLsn, 10);
      const onFailed = vi.fn();
      buffer.onFailed = onFailed;
      await buffer.enqueue(transaction(1));

      const failure = new Error('unreadable message');
      buffer.fail(failure, '0/7');
      buffer.fail(new Error('a second one'), '0/8');
      await vi.advanceTimersByTimeAsync(10);

      expect(onFailed).toHaveBeenCalledExactlyOnceWith(failure, '0/7');
      expect(processFlush).not.toHaveBeenCalled();
      expect(acknowledgeLsn).not.toHaveBeenCalled();
    });

    it('reports every flush that was recorded and acknowledged', async () => {
      const buffer = new FlushBuffer(processFlush, acknowledgeLsn, 0);
      const onFlushed = vi.fn();
      buffer.onFlushed = onFlushed;

      await buffer.enqueue(transaction(1));
      await buffer.enqueue(transaction(2));

      expect(onFlushed).toHaveBeenCalledTimes(2);
    });

    it('takes no events until it is reset: they are read again from the acknowledged position', async () => {
      let fail = true;
      processFlush = vi.fn(async (transactions: PendingEvent[][]) => {
        if (fail) throw new Error('down');
        flushes.push(transactions);
      });
      const buffer = new FlushBuffer(processFlush, acknowledgeLsn, 0);

      await buffer.enqueue(transaction(1));
      await buffer.enqueue(transaction(2));
      expect(processFlush).toHaveBeenCalledOnce();
      expect(acknowledgeLsn).not.toHaveBeenCalled();

      fail = false;
      buffer.reset();
      expect(buffer.isIdle).toBe(true);
      await buffer.enqueue(transaction(1));

      expect(lsnsOf(flushes[0])).toEqual([['0/1']]);
      expect(acknowledgedLsns).toEqual(['0/1']);
    });
  });
});
