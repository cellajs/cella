import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { deferred, mockScope, mockWebSocket, storageMock } from './helpers';

vi.mock('../data/storage', () => storageMock());
vi.mock('../sync/compaction', () => ({ compactDocument: vi.fn().mockResolvedValue('ok') }));

const { getCollab, joinCollab, leaveCollab, broadcastToCollab, withDocLock } = await import('../sync/session-manager');
const { deleteDoc, touchDoc } = await import('../data/storage');
const { compactDocument } = await import('../sync/compaction');

const GRACE = 5 * 60 * 1000;
/** How often a session stamps its row live: well inside GRACE, the startup sweep's cutoff. */
const LIVE_STAMP = 60 * 1000;

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

// A unique entityId per test keeps the module-level session Map from leaking across tests.
let testCounter = 0;
function uniqueCtx(overrides?: Partial<ReturnType<typeof mockScope>>) {
  return mockScope({ entityId: `entity-${++testCounter}`, ...overrides });
}

describe('joinCollab / leaveCollab', () => {
  it('first join creates the session with an idle lock; a second join adds to it', () => {
    const ctx = uniqueCtx();
    const ws1 = mockWebSocket();
    const ws2 = mockWebSocket();
    const collab = joinCollab(ctx, ws1 as never);
    expect(collab.clients.size).toBe(1);
    expect(collab.chain).toBeInstanceOf(Promise);
    expect(joinCollab(ctx, ws2 as never)).toBe(collab);
    expect(collab.clients.size).toBe(2);
  });

  it('leave with peers remaining starts no cleanup; last leave starts the grace timer', () => {
    const ctx = uniqueCtx();
    const ws1 = mockWebSocket();
    const ws2 = mockWebSocket();
    joinCollab(ctx, ws1 as never);
    const collab = joinCollab(ctx, ws2 as never);
    leaveCollab(ctx, ws1 as never);
    expect(collab.cleanupTimer).toBeUndefined();
    leaveCollab(ctx, ws2 as never);
    expect(collab.cleanupTimer).toBeDefined();
  });

  it('rejoin during the grace period cancels cleanup', async () => {
    const ctx = uniqueCtx();
    const ws = mockWebSocket();
    const collab = joinCollab(ctx, ws as never);
    leaveCollab(ctx, ws as never);
    joinCollab(ctx, ws as never);
    expect(collab.cleanupTimer).toBeUndefined();
    await vi.advanceTimersByTimeAsync(GRACE);
    expect(compactDocument).not.toHaveBeenCalled();
    expect(getCollab(ctx)).toBe(collab);
  });

  it('must not delete the document row at cleanup: it compacts, keeps the row a returning client shares history with, and forgets the session', async () => {
    const ctx = uniqueCtx();
    const ws = mockWebSocket();
    const collab = joinCollab(ctx, ws as never);
    collab.compactTimer = setTimeout(() => {}, 3000);
    leaveCollab(ctx, ws as never);

    await vi.advanceTimersByTimeAsync(GRACE);

    expect(compactDocument).toHaveBeenCalledWith(ctx, null);
    expect(deleteDoc).not.toHaveBeenCalled();
    expect(collab.compactTimer).toBeUndefined();
    expect(getCollab(ctx)).toBeUndefined();
  });

  it('deletes the rows at cleanup only when the entity is gone', async () => {
    const ctx = uniqueCtx();
    const ws = mockWebSocket();
    joinCollab(ctx, ws as never);
    vi.mocked(compactDocument).mockResolvedValueOnce('gone');
    leaveCollab(ctx, ws as never);
    await vi.advanceTimersByTimeAsync(GRACE);
    expect(deleteDoc).toHaveBeenCalledWith(ctx);
    expect(getCollab(ctx)).toBeUndefined();
  });

  it('a retryable materialize failure keeps the log and reschedules cleanup', async () => {
    const ctx = uniqueCtx();
    const ws = mockWebSocket();
    joinCollab(ctx, ws as never);
    vi.mocked(compactDocument).mockResolvedValueOnce('retry');
    leaveCollab(ctx, ws as never);

    await vi.advanceTimersByTimeAsync(GRACE);
    expect(getCollab(ctx)).toBeDefined();

    await vi.advanceTimersByTimeAsync(GRACE);
    expect(compactDocument).toHaveBeenCalledTimes(2);
    expect(getCollab(ctx)).toBeUndefined();
  });

  it('a thrown compaction error is treated as retry', async () => {
    const ctx = uniqueCtx();
    const ws = mockWebSocket();
    joinCollab(ctx, ws as never);
    vi.mocked(compactDocument).mockRejectedValueOnce(new Error('db down'));
    leaveCollab(ctx, ws as never);
    await vi.advanceTimersByTimeAsync(GRACE);
    expect(deleteDoc).not.toHaveBeenCalled();
    expect(getCollab(ctx)).toBeDefined();
  });

  it('a failed delete of a gone document still forgets the session', async () => {
    const ctx = uniqueCtx();
    const ws = mockWebSocket();
    joinCollab(ctx, ws as never);
    vi.mocked(compactDocument).mockResolvedValueOnce('gone');
    vi.mocked(deleteDoc).mockRejectedValueOnce(new Error('db down'));
    leaveCollab(ctx, ws as never);
    await vi.advanceTimersByTimeAsync(GRACE);
    expect(getCollab(ctx)).toBeUndefined();
  });

  it('cleanup waits for a running locked task and aborts when a client rejoined meanwhile', async () => {
    const ctx = uniqueCtx();
    const ws = mockWebSocket();
    const collab = joinCollab(ctx, ws as never);
    const gate = deferred();
    void withDocLock(collab, () => gate.promise);
    leaveCollab(ctx, ws as never);

    await vi.advanceTimersByTimeAsync(GRACE);
    expect(compactDocument).not.toHaveBeenCalled();
    joinCollab(ctx, ws as never);
    gate.release();
    await vi.advanceTimersByTimeAsync(0);

    expect(compactDocument).not.toHaveBeenCalled();
    expect(deleteDoc).not.toHaveBeenCalled();
    expect(getCollab(ctx)).toBe(collab);
  });

  it('must not strand a socket that joins while cleanup compacts: the session stays', async () => {
    const ctx = uniqueCtx();
    const ws = mockWebSocket();
    const collab = joinCollab(ctx, ws as never);
    const compaction = deferred();
    vi.mocked(compactDocument).mockImplementationOnce(async () => {
      await compaction.promise;
      return 'ok';
    });
    leaveCollab(ctx, ws as never);
    await vi.advanceTimersByTimeAsync(GRACE);
    expect(compactDocument).toHaveBeenCalledTimes(1);

    // A socket joins after cleanup checked for clients, while its compaction is still writing.
    const joiner = mockWebSocket();
    expect(joinCollab(ctx, joiner as never)).toBe(collab);
    compaction.release();
    await vi.advanceTimersByTimeAsync(0);

    // The relay still finds the joiner's session, so its updates are logged and relayed.
    expect(getCollab(ctx)).toBe(collab);
    expect(collab.clients.has(joiner as never)).toBe(true);

    // Positive control: once the joiner leaves, cleanup runs to the end.
    leaveCollab(ctx, joiner as never);
    await vi.advanceTimersByTimeAsync(GRACE);
    expect(compactDocument).toHaveBeenCalledTimes(2);
    expect(getCollab(ctx)).toBeUndefined();
  });

  it('must not remove a newer live session via a cleanup a passing socket armed', async () => {
    const ctx = uniqueCtx();
    const compaction = deferred();
    vi.mocked(compactDocument).mockImplementationOnce(async () => {
      await compaction.promise;
      return 'empty';
    });
    const first = mockWebSocket();
    joinCollab(ctx, first as never);
    leaveCollab(ctx, first as never);
    await vi.advanceTimersByTimeAsync(GRACE);
    expect(compactDocument).toHaveBeenCalledTimes(1);

    // A socket joins while cleanup compacts and leaves again, arming a cleanup of its own.
    const passing = mockWebSocket();
    joinCollab(ctx, passing as never);
    leaveCollab(ctx, passing as never);
    compaction.release();
    await vi.advanceTimersByTimeAsync(0);

    // An editor opens the document and stays.
    const live = mockWebSocket();
    const session = joinCollab(ctx, live as never);
    await vi.advanceTimersByTimeAsync(GRACE * 2);

    expect(getCollab(ctx)).toBe(session);
    expect(session.clients.has(live as never)).toBe(true);
    expect(live.closed).toBeNull();
  });

  it('must not forget the session of a socket that joined and left while cleanup compacted before its log is compacted', async () => {
    const ctx = uniqueCtx();
    const compaction = deferred();
    vi.mocked(compactDocument).mockImplementationOnce(async () => {
      await compaction.promise;
      return 'ok';
    });
    const first = mockWebSocket();
    const collab = joinCollab(ctx, first as never);
    leaveCollab(ctx, first as never);
    await vi.advanceTimersByTimeAsync(GRACE);

    // It joins after the compaction read the log: what it logs waits for the next compaction.
    const passing = mockWebSocket();
    joinCollab(ctx, passing as never);
    leaveCollab(ctx, passing as never);
    compaction.release();
    await vi.advanceTimersByTimeAsync(0);
    expect(compactDocument).toHaveBeenCalledTimes(1);
    expect(getCollab(ctx)).toBe(collab);

    // Positive control: the cleanup its leave armed compacts once more, then forgets the session.
    await vi.advanceTimersByTimeAsync(GRACE);
    expect(compactDocument).toHaveBeenCalledTimes(2);
    expect(getCollab(ctx)).toBeUndefined();
  });

  it('must not arm a second cleanup via a leave from a socket that is not in the session', async () => {
    const ctx = uniqueCtx();
    const ws = mockWebSocket();
    const collab = joinCollab(ctx, ws as never);
    leaveCollab(ctx, ws as never);
    const armed = collab.cleanupTimer;

    leaveCollab(ctx, ws as never);
    leaveCollab(ctx, mockWebSocket() as never);
    expect(collab.cleanupTimer).toBe(armed);

    // Positive control: a join cancels the one cleanup, and none runs.
    joinCollab(ctx, mockWebSocket() as never);
    await vi.advanceTimersByTimeAsync(GRACE * 2);
    expect(compactDocument).not.toHaveBeenCalled();
    expect(getCollab(ctx)).toBe(collab);
  });

  it('must not retry a refused cleanup forever: after an hour it keeps the log for the sweep and forgets the session', async () => {
    const ctx = uniqueCtx();
    const ws = mockWebSocket();
    joinCollab(ctx, ws as never);
    vi.mocked(compactDocument).mockResolvedValue('retry');
    leaveCollab(ctx, ws as never);

    await vi.advanceTimersByTimeAsync(GRACE * 12);
    expect(compactDocument).toHaveBeenCalledTimes(12);
    expect(getCollab(ctx)).toBeUndefined();
    expect(deleteDoc).not.toHaveBeenCalled();

    // No timer is left behind: nothing runs again.
    await vi.advanceTimersByTimeAsync(GRACE * 12);
    expect(compactDocument).toHaveBeenCalledTimes(12);
    vi.mocked(compactDocument).mockReset();
    vi.mocked(compactDocument).mockResolvedValue('ok');
  });

  it('must not share a session between tenants via the same entity id', () => {
    const ctx = uniqueCtx();
    const ours = mockWebSocket();
    const theirs = mockWebSocket();
    const collab = joinCollab(ctx, ours as never);
    const other = joinCollab({ ...ctx, tenantId: 'tenant-2', organizationId: 'org-2' }, theirs as never);
    expect(other).not.toBe(collab);
    expect(other.scope.tenantId).toBe('tenant-2');
    broadcastToCollab(collab, new Uint8Array([1, 2, 3]));
    expect(theirs.sent).toHaveLength(0);
    // Positive control: the same tenant's document is the same session, and its members receive the broadcast.
    const peer = mockWebSocket();
    expect(joinCollab(ctx, peer as never)).toBe(collab);
    broadcastToCollab(collab, new Uint8Array([4, 5, 6]), ours as never);
    expect(peer.sent).toHaveLength(1);
  });

  it('leave for an unknown session is a no-op', () => {
    expect(() => leaveCollab(mockScope({ entityId: 'nope' }), mockWebSocket() as never)).not.toThrow();
  });
});

describe('live stamps', () => {
  it('must not let a session look orphaned: it stamps its row live when it opens and every minute until it is forgotten', async () => {
    const ctx = uniqueCtx();
    const ws = mockWebSocket();
    // A failed stamp neither fails the join nor stops the next one.
    vi.mocked(touchDoc).mockRejectedValueOnce(new Error('db down'));
    const collab = joinCollab(ctx, ws as never);
    expect(touchDoc).toHaveBeenCalledTimes(1);
    expect(touchDoc).toHaveBeenCalledWith(ctx);
    // A socket joining the open session stamps nothing more.
    const peer = mockWebSocket();
    joinCollab(ctx, peer as never);
    expect(touchDoc).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(LIVE_STAMP);
    expect(touchDoc).toHaveBeenCalledTimes(2);

    // Idle through its grace period, the session stays live until cleanup forgets it.
    await vi.advanceTimersByTimeAsync(LIVE_STAMP / 2);
    leaveCollab(ctx, ws as never);
    leaveCollab(ctx, peer as never);
    await vi.advanceTimersByTimeAsync(GRACE);
    expect(getCollab(ctx)).toBeUndefined();
    expect(touchDoc).toHaveBeenCalledTimes(2 + GRACE / LIVE_STAMP);
    expect(touchDoc).toHaveBeenLastCalledWith(collab.scope);

    await vi.advanceTimersByTimeAsync(LIVE_STAMP * 3);
    expect(touchDoc).toHaveBeenCalledTimes(2 + GRACE / LIVE_STAMP);
  });
});

describe('a retired document', () => {
  it('must not keep serving a document whose row is gone: a live stamp that finds none ends the session with 1013', async () => {
    const ctx = uniqueCtx();
    const ws = mockWebSocket();
    const peer = mockWebSocket();
    const collab = joinCollab(ctx, ws as never);
    joinCollab(ctx, peer as never);
    // The first handshake loaded the row; then its description was written outside the relay, which deleted it.
    collab.generation = 'gen-1';
    vi.mocked(touchDoc).mockResolvedValueOnce(false);

    await vi.advanceTimersByTimeAsync(LIVE_STAMP);

    expect(ws.closed).toEqual({ code: 1013, reason: 'Document retired' });
    expect(peer.closed).toEqual({ code: 1013, reason: 'Document retired' });
    expect(getCollab(ctx)).toBeUndefined();
    // No timer is left on it: the sockets' reconnects open a session of their own.
    await vi.advanceTimersByTimeAsync(GRACE * 2);
    expect(touchDoc).toHaveBeenCalledTimes(2);
    expect(compactDocument).not.toHaveBeenCalled();
  });

  it('must not end a session whose document is not seeded yet: a stamp that finds no row before the first handshake is no verdict', async () => {
    const ctx = uniqueCtx();
    const ws = mockWebSocket();
    vi.mocked(touchDoc).mockResolvedValueOnce(false).mockResolvedValueOnce(false);
    const collab = joinCollab(ctx, ws as never);
    await vi.advanceTimersByTimeAsync(LIVE_STAMP);
    expect(touchDoc).toHaveBeenCalledTimes(2);
    expect(getCollab(ctx)).toBe(collab);
    expect(ws.closed).toBeNull();
  });
});

describe('withDocLock', () => {
  it('serializes tasks in order and a failed task releases the lock', async () => {
    const collab = joinCollab(uniqueCtx(), mockWebSocket() as never);
    const order: string[] = [];
    const gate = deferred();
    const first = withDocLock(collab, async () => {
      await gate.promise;
      order.push('first');
    });
    const second = withDocLock(collab, async () => {
      order.push('second');
      throw new Error('fail');
    });
    const third = withDocLock(collab, async () => {
      order.push('third');
      return 3;
    });
    gate.release();
    await first;
    await expect(second).rejects.toThrow('fail');
    expect(await third).toBe(3);
    expect(order).toEqual(['first', 'second', 'third']);
  });
});

describe('broadcastToCollab', () => {
  it('broadcasts to all open peers except the sender', () => {
    const ctx = uniqueCtx();
    const sender = mockWebSocket();
    const peer = mockWebSocket();
    const closed = mockWebSocket({ readyState: 3 });
    const collab = joinCollab(ctx, sender as never);
    joinCollab(ctx, peer as never);
    joinCollab(ctx, closed as never);

    const message = new Uint8Array([1, 2, 3]);
    broadcastToCollab(collab, message, sender as never);

    expect(sender.sent).toHaveLength(0);
    expect(peer.sent).toEqual([message]);
    expect(closed.sent).toHaveLength(0);
  });
});
