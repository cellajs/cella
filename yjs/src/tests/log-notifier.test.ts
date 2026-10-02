import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type LogNotice, YJS_LOG_NOTICE_MAX_IDS } from '#/modules/yjs/helpers/yjs-log';
import { deferred, mockScope } from './helpers';

// The default notifier sends through the pool: none of these tests reaches it.
vi.mock('../data/db', () => ({ db: {} }));

const { createLogNotifier } = await import('../data/log-notifier');
const { log } = await import('../lib/pino');

const one = mockScope({ entityId: 'doc-1' });
const two = mockScope({ entityId: 'doc-2' });
const keyOf = ({ tenantId, entityType, entityId }: typeof one) => ({ tenantId, entityType, entityId });

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('log notifier', () => {
  it('announces a batch once, after the delay, with one notice per document holding every row in order', async () => {
    const send = vi.fn(async (_notices: LogNotice[]) => {});
    const notifier = createLogNotifier(send, 50);

    notifier.queue(one, 3);
    notifier.queue(two, 4);
    notifier.queue(one, 5);
    await vi.advanceTimersByTimeAsync(49);
    expect(send).not.toHaveBeenCalled();
    notifier.queue(one, 6);
    await vi.advanceTimersByTimeAsync(1);

    expect(send).toHaveBeenCalledExactlyOnceWith([
      { ...keyOf(one), logIds: [3, 5, 6] },
      { ...keyOf(two), logIds: [4] },
    ]);
  });

  it('gives a row queued after a batch was sent a batch and a send of its own', async () => {
    const send = vi.fn(async (_notices: LogNotice[]) => {});
    const notifier = createLogNotifier(send, 50);

    notifier.queue(one, 1);
    await vi.advanceTimersByTimeAsync(50);
    notifier.queue(one, 2);
    await vi.advanceTimersByTimeAsync(50);

    expect(send.mock.calls).toEqual([[[{ ...keyOf(one), logIds: [1] }]], [[{ ...keyOf(one), logIds: [2] }]]]);
  });

  it('runs one send at a time: rows queued while a send waits go together in the next batch, once it returned', async () => {
    const held = deferred();
    const send = vi.fn(async (_notices: LogNotice[]) => {});
    send.mockImplementationOnce(() => held.promise);
    const notifier = createLogNotifier(send, 50);

    notifier.queue(one, 1);
    await vi.advanceTimersByTimeAsync(50);
    notifier.queue(one, 2);
    notifier.queue(two, 3);
    await vi.advanceTimersByTimeAsync(500);
    // The first send waits, as a notify waits for the cluster-wide lock: no second one takes another pool connection.
    expect(send).toHaveBeenCalledTimes(1);
    held.release();
    await vi.advanceTimersByTimeAsync(50);

    expect(send.mock.calls[1]).toEqual([
      [
        { ...keyOf(one), logIds: [2] },
        { ...keyOf(two), logIds: [3] },
      ],
    ]);
  });

  it('flushes at shutdown after the send in flight returned, with what was queued meanwhile', async () => {
    const held = deferred();
    const send = vi.fn(async (_notices: LogNotice[]) => {});
    send.mockImplementationOnce(() => held.promise);
    const notifier = createLogNotifier(send, 50);

    notifier.queue(one, 1);
    await vi.advanceTimersByTimeAsync(50);
    notifier.queue(one, 2);
    const flushed = notifier.flush();
    held.release();
    await flushed;

    expect(send.mock.calls).toEqual([[[{ ...keyOf(one), logIds: [1] }]], [[{ ...keyOf(one), logIds: [2] }]]]);
  });

  it('splits a document with more rows than one notice may carry into several notices of one send', async () => {
    const send = vi.fn(async (_notices: LogNotice[]) => {});
    const notifier = createLogNotifier(send, 50);
    const ids = Array.from({ length: YJS_LOG_NOTICE_MAX_IDS + 1 }, (_, i) => i + 1);

    for (const id of ids) notifier.queue(one, id);
    await vi.advanceTimersByTimeAsync(50);

    expect(send).toHaveBeenCalledExactlyOnceWith([
      { ...keyOf(one), logIds: ids.slice(0, YJS_LOG_NOTICE_MAX_IDS) },
      { ...keyOf(one), logIds: [YJS_LOG_NOTICE_MAX_IDS + 1] },
    ]);
  });

  it('sends at once on flush, as shutdown does, and leaves no timer behind; with nothing queued it sends nothing', async () => {
    const send = vi.fn(async (_notices: LogNotice[]) => {});
    const notifier = createLogNotifier(send, 50);

    await notifier.flush();
    expect(send).not.toHaveBeenCalled();
    notifier.queue(one, 7);
    await notifier.flush();
    expect(send).toHaveBeenCalledExactlyOnceWith([{ ...keyOf(one), logIds: [7] }]);
    await vi.advanceTimersByTimeAsync(100);
    expect(send).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('logs and drops a batch whose send fails, and sends the next one', async () => {
    const send = vi.fn(async (_notices: LogNotice[]) => {});
    send.mockRejectedValueOnce(new Error('connection lost'));
    const notifier = createLogNotifier(send, 50);

    notifier.queue(one, 1);
    await vi.advanceTimersByTimeAsync(50);
    expect(log.warn).toHaveBeenCalledOnce();
    notifier.queue(one, 2);
    await vi.advanceTimersByTimeAsync(50);

    expect(send.mock.calls.at(-1)).toEqual([[{ ...keyOf(one), logIds: [2] }]]);
  });
});
