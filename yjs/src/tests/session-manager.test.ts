import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockDocContext, mockWebSocket, storageMock } from './helpers';

// Mock storage to avoid DB calls in unit tests
vi.mock('../data/storage', () => storageMock());

// Mock the durable-record write; its return value controls cleanup.
vi.mock('../sync/materialize', () => ({
  materializeState: vi.fn().mockResolvedValue('ok'),
  postMaterialize: vi.fn().mockResolvedValue('ok'),
  stateToBlocksJson: vi.fn(() => '[]'),
}));

// Import real session-manager (not mocked)
const { getCollab, joinCollab, leaveCollab, broadcastToCollab } = await import('../sync/session-manager');
const { deleteState, loadState, saveState } = await import('../data/storage');
const { materializeState } = await import('../sync/materialize');

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

// Each test uses a unique entityId to avoid cross-test state pollution from the module-level Map
let testCounter = 0;
function uniqueCtx(overrides?: Partial<ReturnType<typeof mockDocContext>>) {
  return mockDocContext({ entityId: `entity-${++testCounter}`, ...overrides });
}

describe('joinCollab / leaveCollab', () => {
  it('4.1.1 first join creates session', () => {
    const ctx = uniqueCtx();
    const ws = mockWebSocket();
    const collab = joinCollab(ctx, ws as any);
    expect(collab.clients.size).toBe(1);
    expect(collab.ctx).toEqual(ctx);
  });

  it('4.1.2 second join adds to existing', () => {
    const ctx = uniqueCtx();
    const ws1 = mockWebSocket();
    const ws2 = mockWebSocket();
    joinCollab(ctx, ws1 as any);
    joinCollab(ctx, ws2 as any);
    const collab = getCollab(ctx.entityType, ctx.entityId);
    expect(collab?.clients.size).toBe(2);
  });

  it('4.1.3 leave removes client, no cleanup if others remain', () => {
    const ctx = uniqueCtx();
    const ws1 = mockWebSocket();
    const ws2 = mockWebSocket();
    joinCollab(ctx, ws1 as any);
    joinCollab(ctx, ws2 as any);
    leaveCollab(ctx.entityType, ctx.entityId, ws1 as any);
    const collab = getCollab(ctx.entityType, ctx.entityId);
    expect(collab?.clients.size).toBe(1);
    expect(collab?.cleanupTimer).toBeUndefined();
  });

  it('4.1.4 last leave starts cleanup timer', () => {
    const ctx = uniqueCtx();
    const ws = mockWebSocket();
    joinCollab(ctx, ws as any);
    leaveCollab(ctx.entityType, ctx.entityId, ws as any);
    const collab = getCollab(ctx.entityType, ctx.entityId);
    expect(collab?.cleanupTimer).toBeDefined();
  });

  it('4.1.5 rejoin during grace period cancels cleanup', () => {
    const ctx = uniqueCtx();
    const ws1 = mockWebSocket();
    const ws2 = mockWebSocket();
    joinCollab(ctx, ws1 as any);
    leaveCollab(ctx.entityType, ctx.entityId, ws1 as any);

    joinCollab(ctx, ws2 as any);
    const collab = getCollab(ctx.entityType, ctx.entityId);
    expect(collab?.cleanupTimer).toBeUndefined();
    expect(collab?.clients.size).toBe(1);
  });

  it('4.1.6 cleanup deletes state after grace period', async () => {
    const ctx = uniqueCtx();
    const ws = mockWebSocket();
    joinCollab(ctx, ws as any);
    leaveCollab(ctx.entityType, ctx.entityId, ws as any);

    await vi.advanceTimersByTimeAsync(5 * 60 * 1000);

    expect(deleteState).toHaveBeenCalledWith(ctx);
    expect(getCollab(ctx.entityType, ctx.entityId)).toBeUndefined();
  });

  it('4.1.6b cleanup materializes final state before deleting', async () => {
    const ctx = uniqueCtx();
    const ws = mockWebSocket();
    const collab = joinCollab(ctx, ws as any);
    collab.pendingState = new Uint8Array([1, 2, 3]);
    leaveCollab(ctx.entityType, ctx.entityId, ws as any);

    await vi.advanceTimersByTimeAsync(5 * 60 * 1000);

    // Pending state is flushed, persisted to the entity, and then deleted.
    expect(saveState).toHaveBeenCalled();
    expect(materializeState).toHaveBeenCalledWith(collab, new Uint8Array([1, 2, 3]));
    expect(deleteState).toHaveBeenCalledWith(ctx);
    expect(getCollab(ctx.entityType, ctx.entityId)).toBeUndefined();
  });

  it('4.1.6c cleanup materializes stored state when nothing is pending', async () => {
    const ctx = uniqueCtx();
    const stored = new Uint8Array([9, 9]);
    vi.mocked(loadState).mockResolvedValueOnce(stored);
    const ws = mockWebSocket();
    const collab = joinCollab(ctx, ws as any);
    leaveCollab(ctx.entityType, ctx.entityId, ws as any);

    await vi.advanceTimersByTimeAsync(5 * 60 * 1000);

    expect(materializeState).toHaveBeenCalledWith(collab, stored);
    expect(deleteState).toHaveBeenCalledWith(ctx);
  });

  it('4.1.6d retry-class materialize failure blocks deletion and reschedules cleanup', async () => {
    const ctx = uniqueCtx();
    const ws = mockWebSocket();
    const collab = joinCollab(ctx, ws as any);
    collab.pendingState = new Uint8Array([1]);
    vi.mocked(materializeState).mockResolvedValueOnce('retry');
    leaveCollab(ctx.entityType, ctx.entityId, ws as any);

    await vi.advanceTimersByTimeAsync(5 * 60 * 1000);

    // Durable record hasn't absorbed the session: row and session must survive
    expect(deleteState).not.toHaveBeenCalled();
    expect(getCollab(ctx.entityType, ctx.entityId)).toBe(collab);

    // Backend recovers: rescheduled cleanup converges and deletes.
    // The flushed state was consumed; the retry loads it back from storage.
    vi.mocked(loadState).mockResolvedValueOnce(new Uint8Array([1]));
    await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
    expect(deleteState).toHaveBeenCalledWith(ctx);
    expect(getCollab(ctx.entityType, ctx.entityId)).toBeUndefined();
  });

  it('4.1.7 cleanup cancelled if client rejoined before expiry', async () => {
    const ctx = uniqueCtx();
    const ws1 = mockWebSocket();
    const ws2 = mockWebSocket();
    joinCollab(ctx, ws1 as any);
    leaveCollab(ctx.entityType, ctx.entityId, ws1 as any);

    joinCollab(ctx, ws2 as any);

    await vi.advanceTimersByTimeAsync(5 * 60 * 1000);

    expect(deleteState).not.toHaveBeenCalled();
    expect(getCollab(ctx.entityType, ctx.entityId)).toBeDefined();
  });

  it('4.1.8 cleanup handles deleteState failure', async () => {
    const ctx = uniqueCtx();
    vi.mocked(deleteState).mockRejectedValueOnce(new Error('DB error'));
    const ws = mockWebSocket();
    joinCollab(ctx, ws as any);
    leaveCollab(ctx.entityType, ctx.entityId, ws as any);

    await vi.advanceTimersByTimeAsync(5 * 60 * 1000);

    expect(getCollab(ctx.entityType, ctx.entityId)).toBeUndefined();
  });

  it('4.1.9 pending save timer cancelled on cleanup', async () => {
    const ctx = uniqueCtx();
    const ws = mockWebSocket();
    const collab = joinCollab(ctx, ws as any);
    collab.saveTimer = setTimeout(() => {}, 999999);

    leaveCollab(ctx.entityType, ctx.entityId, ws as any);
    await vi.advanceTimersByTimeAsync(5 * 60 * 1000);

    expect(getCollab(ctx.entityType, ctx.entityId)).toBeUndefined();
  });

  it('4.1.10 leave for unknown session is no-op', () => {
    const ws = mockWebSocket();
    expect(() => leaveCollab('unknown', 'unknown', ws as any)).not.toThrow();
  });

  it('4.1.11 cleanup awaits in-flight save before deleting', async () => {
    const ctx = uniqueCtx();
    const ws = mockWebSocket();
    const collab = joinCollab(ctx, ws as any);

    // Simulate an in-flight save that takes 100ms
    let saveResolved = false;
    collab.savingPromise = new Promise<void>((resolve) => {
      setTimeout(() => {
        saveResolved = true;
        resolve();
      }, 100);
    });

    leaveCollab(ctx.entityType, ctx.entityId, ws as any);

    // Advance past grace period but not past the save
    await vi.advanceTimersByTimeAsync(5 * 60 * 1000);

    // Save should have been awaited (timer advanced past 100ms too)
    expect(saveResolved).toBe(true);
    expect(deleteState).toHaveBeenCalledWith(ctx);
  });

  it('4.1.12 cleanup proceeds if in-flight save fails', async () => {
    const ctx = uniqueCtx();
    const ws = mockWebSocket();
    const collab = joinCollab(ctx, ws as any);

    // Simulate a failing in-flight save
    const failingPromise = new Promise<void>((_, reject) => {
      setTimeout(() => reject(new Error('save failed')), 50);
    });
    // Prevent unhandled rejection while letting production code handle it via try/catch
    failingPromise.catch(() => {});
    collab.savingPromise = failingPromise;

    leaveCollab(ctx.entityType, ctx.entityId, ws as any);
    await vi.advanceTimersByTimeAsync(5 * 60 * 1000);

    // Should still clean up despite the failed save
    expect(deleteState).toHaveBeenCalledWith(ctx);
    expect(getCollab(ctx.entityType, ctx.entityId)).toBeUndefined();
  });
});

describe('broadcastToCollab', () => {
  const message = new Uint8Array([1, 2, 3]);

  it('3.1.1 broadcasts to all peers except sender', () => {
    const ctx = uniqueCtx();
    const sender = mockWebSocket();
    const peer1 = mockWebSocket();
    const peer2 = mockWebSocket();
    joinCollab(ctx, sender as any);
    joinCollab(ctx, peer1 as any);
    joinCollab(ctx, peer2 as any);

    broadcastToCollab(ctx.entityType, ctx.entityId, message, sender as any);

    expect(sender.sent).toHaveLength(0);
    expect(peer1.sent).toHaveLength(1);
    expect(peer2.sent).toHaveLength(1);
  });

  it('3.1.2 skips closed sockets', () => {
    const ctx = uniqueCtx();
    const sender = mockWebSocket();
    const closed = mockWebSocket({ readyState: 3 });
    const open = mockWebSocket();
    joinCollab(ctx, sender as any);
    joinCollab(ctx, closed as any);
    joinCollab(ctx, open as any);

    broadcastToCollab(ctx.entityType, ctx.entityId, message, sender as any);

    expect(closed.sent).toHaveLength(0);
    expect(open.sent).toHaveLength(1);
  });

  it('3.1.3 broadcast scoped to entity', () => {
    const ctxA = uniqueCtx();
    const ctxB = uniqueCtx();
    const wsA = mockWebSocket();
    const wsB = mockWebSocket();
    const sender = mockWebSocket();

    joinCollab(ctxA, sender as any);
    joinCollab(ctxA, wsA as any);
    joinCollab(ctxB, wsB as any);

    broadcastToCollab(ctxA.entityType, ctxA.entityId, message, sender as any);

    expect(wsA.sent).toHaveLength(1);
    expect(wsB.sent).toHaveLength(0);
  });
});
