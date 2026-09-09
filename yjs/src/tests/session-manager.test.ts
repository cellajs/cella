import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { deferred, mockDocContext, mockWebSocket, storageMock } from './helpers';

vi.mock('../data/storage', () => storageMock());
vi.mock('../sync/compaction', () => ({ compactDocument: vi.fn().mockResolvedValue('ok') }));

const { getCollab, joinCollab, leaveCollab, broadcastToCollab, withDocLock } = await import('../sync/session-manager');
const { deleteDoc } = await import('../data/storage');
const { compactDocument } = await import('../sync/compaction');

const GRACE = 5 * 60 * 1000;

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

// A unique entityId per test keeps the module-level session Map from leaking across tests.
let testCounter = 0;
function uniqueCtx(overrides?: Partial<ReturnType<typeof mockDocContext>>) {
  return mockDocContext({ entityId: `entity-${++testCounter}`, verified: true, ...overrides });
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
    leaveCollab(ctx.entityType, ctx.entityId, ws1 as never);
    expect(collab.cleanupTimer).toBeUndefined();
    leaveCollab(ctx.entityType, ctx.entityId, ws2 as never);
    expect(collab.cleanupTimer).toBeDefined();
  });

  it('rejoin during the grace period cancels cleanup', async () => {
    const ctx = uniqueCtx();
    const ws = mockWebSocket();
    const collab = joinCollab(ctx, ws as never);
    leaveCollab(ctx.entityType, ctx.entityId, ws as never);
    joinCollab(ctx, ws as never);
    expect(collab.cleanupTimer).toBeUndefined();
    await vi.advanceTimersByTimeAsync(GRACE);
    expect(compactDocument).not.toHaveBeenCalled();
    expect(getCollab(ctx.entityType, ctx.entityId)).toBe(collab);
  });

  it('cleanup compacts, deletes the rows, and forgets the session', async () => {
    const ctx = uniqueCtx();
    const ws = mockWebSocket();
    const collab = joinCollab(ctx, ws as never);
    collab.compactTimer = setTimeout(() => {}, 3000);
    leaveCollab(ctx.entityType, ctx.entityId, ws as never);

    await vi.advanceTimersByTimeAsync(GRACE);

    expect(compactDocument).toHaveBeenCalledWith(ctx);
    expect(deleteDoc).toHaveBeenCalledWith(ctx);
    expect(collab.compactTimer).toBeUndefined();
    expect(getCollab(ctx.entityType, ctx.entityId)).toBeUndefined();
  });

  it('a retryable materialize failure keeps the rows and reschedules cleanup', async () => {
    const ctx = uniqueCtx();
    const ws = mockWebSocket();
    joinCollab(ctx, ws as never);
    vi.mocked(compactDocument).mockResolvedValueOnce('retry');
    leaveCollab(ctx.entityType, ctx.entityId, ws as never);

    await vi.advanceTimersByTimeAsync(GRACE);
    expect(deleteDoc).not.toHaveBeenCalled();
    expect(getCollab(ctx.entityType, ctx.entityId)).toBeDefined();

    await vi.advanceTimersByTimeAsync(GRACE);
    expect(compactDocument).toHaveBeenCalledTimes(2);
    expect(deleteDoc).toHaveBeenCalledTimes(1);
    expect(getCollab(ctx.entityType, ctx.entityId)).toBeUndefined();
  });

  it('a thrown compaction error is treated as retry', async () => {
    const ctx = uniqueCtx();
    const ws = mockWebSocket();
    joinCollab(ctx, ws as never);
    vi.mocked(compactDocument).mockRejectedValueOnce(new Error('db down'));
    leaveCollab(ctx.entityType, ctx.entityId, ws as never);
    await vi.advanceTimersByTimeAsync(GRACE);
    expect(deleteDoc).not.toHaveBeenCalled();
    expect(getCollab(ctx.entityType, ctx.entityId)).toBeDefined();
  });

  it('a delete failure still forgets the session (the sweep finishes the rows on the next boot)', async () => {
    const ctx = uniqueCtx();
    const ws = mockWebSocket();
    joinCollab(ctx, ws as never);
    vi.mocked(deleteDoc).mockRejectedValueOnce(new Error('db down'));
    leaveCollab(ctx.entityType, ctx.entityId, ws as never);
    await vi.advanceTimersByTimeAsync(GRACE);
    expect(getCollab(ctx.entityType, ctx.entityId)).toBeUndefined();
  });

  it('cleanup waits for a running locked task and aborts when a client rejoined meanwhile', async () => {
    const ctx = uniqueCtx();
    const ws = mockWebSocket();
    const collab = joinCollab(ctx, ws as never);
    const gate = deferred();
    void withDocLock(collab, () => gate.promise);
    leaveCollab(ctx.entityType, ctx.entityId, ws as never);

    await vi.advanceTimersByTimeAsync(GRACE);
    expect(compactDocument).not.toHaveBeenCalled();
    joinCollab(ctx, ws as never);
    gate.release();
    await vi.advanceTimersByTimeAsync(0);

    expect(compactDocument).not.toHaveBeenCalled();
    expect(deleteDoc).not.toHaveBeenCalled();
    expect(getCollab(ctx.entityType, ctx.entityId)).toBe(collab);
  });

  it('leave for an unknown session is a no-op', () => {
    expect(() => leaveCollab('task', 'nope', mockWebSocket() as never)).not.toThrow();
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
  it('broadcasts to all open peers except the sender, scoped to the entity', () => {
    const ctx = uniqueCtx();
    const sender = mockWebSocket();
    const peer = mockWebSocket();
    const closed = mockWebSocket({ readyState: 3 });
    joinCollab(ctx, sender as never);
    joinCollab(ctx, peer as never);
    joinCollab(ctx, closed as never);
    const otherPeer = mockWebSocket();
    joinCollab(uniqueCtx(), otherPeer as never);

    const message = new Uint8Array([1, 2, 3]);
    broadcastToCollab(ctx.entityType, ctx.entityId, message, sender as never);

    expect(sender.sent).toHaveLength(0);
    expect(peer.sent).toEqual([message]);
    expect(closed.sent).toHaveLength(0);
    expect(otherPeer.sent).toHaveLength(0);
  });
});
