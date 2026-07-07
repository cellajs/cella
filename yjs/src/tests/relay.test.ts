import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import { mockDocContext, mockWebSocket, buildSyncStep1, buildSyncUpdate, buildAwarenessMessage, decodeSyncStep2, storageMock } from './helpers';

// Mock dependencies
vi.mock('../data/storage', () => storageMock());

// No entity description by default: individual tests override to exercise seeding.
// (Also keeps the pg pool in data/db from being instantiated by the import chain.)
vi.mock('../data/entity-content', () => ({
  loadEntityDescription: vi.fn().mockResolvedValue(null),
}));

// Mock materialization: the save-window integration is asserted via call args
vi.mock('../sync/materialize', () => ({
  materializeState: vi.fn().mockResolvedValue('ok'),
  postMaterialize: vi.fn().mockResolvedValue('ok'),
  stateToBlocksJson: vi.fn(() => '[]'),
}));

vi.mock('../sync/session-manager', () => {
  const collabs = new Map<string, any>();
  return {
    getCollab: vi.fn((entityType: string, entityId: string) => collabs.get(`${entityType}:${entityId}`)),
    broadcastToCollab: vi.fn(),
    joinCollab: vi.fn((ctx: any) => {
      const key = `${ctx.entityType}:${ctx.entityId}`;
      if (!collabs.has(key)) {
        collabs.set(key, { ctx, clients: new Set(), pendingState: undefined, saveTimer: undefined });
      }
      return collabs.get(key);
    }),
    leaveCollab: vi.fn(),
    // Expose for test manipulation
    _collabs: collabs,
  };
});

const { handleMessage } = await import('../sync/relay');
const { loadState, saveState, createDoc } = await import('../data/storage');
const { loadEntityDescription } = await import('../data/entity-content');
const { materializeState } = await import('../sync/materialize');
const { yUpdateToBlocks } = await import('../lib/blocknote-seed');
const { broadcastToCollab, getCollab, joinCollab, _collabs } = await import('../sync/session-manager') as any;

const unverifiedCtx = mockDocContext();
const ctx = mockDocContext({ verified: true });

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  _collabs.clear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('handleMessage — pre-verification buffering', () => {
  it('sync step 1 is buffered when unverified', async () => {
    const ws = mockWebSocket();
    await handleMessage(unverifiedCtx, ws as any, buildSyncStep1(new Uint8Array([])));

    // No response yet: message is buffered
    expect(ws.sent).toHaveLength(0);
    expect(loadState).not.toHaveBeenCalled();
  });

  it('sync update is buffered when unverified', async () => {
    const ws = mockWebSocket();
    joinCollab(unverifiedCtx);

    const doc = new Y.Doc();
    doc.getMap('test').set('key', 'value');
    await handleMessage(unverifiedCtx, ws as any, buildSyncUpdate(Y.encodeStateAsUpdate(doc)));

    // Update not applied: no broadcast, no pending state
    expect(broadcastToCollab).not.toHaveBeenCalled();
  });

  it('awareness is allowed when unverified', async () => {
    const ws = mockWebSocket();
    const awarenessData = buildAwarenessMessage(new Uint8Array([1, 2, 3]));

    await handleMessage(unverifiedCtx, ws as any, awarenessData);

    expect(broadcastToCollab).toHaveBeenCalledTimes(1);
  });
});

describe('handleMessage — sync step 1', () => {
  it('2.1.1 first connection without entity content — creates empty doc', async () => {
    vi.mocked(loadState).mockResolvedValue(null);
    const ws = mockWebSocket();

    await handleMessage(ctx, ws as any, buildSyncStep1(new Uint8Array([])));

    expect(createDoc).toHaveBeenCalledWith(ctx, null);
    expect(ws.sent).toHaveLength(1);
    // Should be a valid sync-step-2 with empty doc state
    const update = decodeSyncStep2(ws.sent[0]);
    expect(update.length).toBeGreaterThan(0);
  });

  it('2.1.1c first connection with entity content — seeds the doc server-side', async () => {
    // Simulate real storage for the fresh-doc path: createDoc persists, loadState reads back.
    // Once-queued mocks only: persistent overrides would leak past clearAllMocks.
    let stored: Uint8Array | null = null;
    vi.mocked(createDoc).mockImplementationOnce(async (_ctx, initialState?: Uint8Array | null) => {
      stored = initialState ?? new Uint8Array(0);
    });
    vi.mocked(loadState)
      .mockResolvedValueOnce(null) // storedState: no row yet
      .mockImplementationOnce(async () => stored); // canonical re-load after createDoc
    const description = JSON.stringify([
      { id: 'b1', type: 'paragraph', props: {}, content: [{ type: 'text', text: 'seeded', styles: {} }], children: [] },
      { id: 'b2', type: 'checklistItem', props: { checkboxId: 'cb-1', checked: true }, content: [], children: [] },
    ]);
    vi.mocked(loadEntityDescription).mockResolvedValueOnce(description);
    const ws = mockWebSocket();

    await handleMessage(ctx, ws as any, buildSyncStep1(new Uint8Array([])));

    expect(ws.sent).toHaveLength(1);
    const update = decodeSyncStep2(ws.sent[0]);
    const blocks = yUpdateToBlocks(update);
    expect(blocks.map((b) => b.type)).toEqual(['paragraph', 'checklistItem']);
    expect(blocks[1].props).toMatchObject({ checkboxId: 'cb-1', checked: true });
  });

  it('2.1.1d concurrent seeders converge on the canonical row', async () => {
    // Second connector's insert loses (ON CONFLICT DO NOTHING): it must adopt the winner's seed
    const winner = new TextEncoder().encode('winner-seed-state');
    vi.mocked(loadState)
      .mockResolvedValueOnce(null) // storedState: no row yet
      .mockResolvedValueOnce(winner as Uint8Array); // re-load after createDoc: winner's row
    // createDoc keeps its factory default (resolves undefined): exactly the conflict no-op
    vi.mocked(loadEntityDescription).mockResolvedValueOnce(
      JSON.stringify([{ id: 'b1', type: 'paragraph', props: {}, content: [], children: [] }]),
    );
    const ws = mockWebSocket();

    await handleMessage(ctx, ws as any, buildSyncStep1(new Uint8Array([])));

    // The client receives the canonical (winner's) state, not this connector's own seed
    expect(ws.sent).toHaveLength(1);
    expect(decodeSyncStep2(ws.sent[0])).toEqual(winner);
  });

  it('2.1.1b existing row with empty state — skips createDoc', async () => {
    vi.mocked(loadState).mockResolvedValueOnce(new Uint8Array(0));
    const ws = mockWebSocket();

    await handleMessage(ctx, ws as any, buildSyncStep1(new Uint8Array([])));

    expect(createDoc).not.toHaveBeenCalled();
    expect(ws.sent).toHaveLength(1);
  });

  it('2.1.2 existing state — sends diff', async () => {
    const doc = new Y.Doc();
    doc.getMap('test').set('key', 'value');
    const storedState = Y.encodeStateAsUpdate(doc);
    vi.mocked(loadState).mockResolvedValueOnce(storedState);
    const ws = mockWebSocket();

    // Client has empty state vector
    const emptyVector = Y.encodeStateVector(new Y.Doc());
    await handleMessage(ctx, ws as any, buildSyncStep1(emptyVector));

    expect(ws.sent).toHaveLength(1);
    // Verify the response can be applied to a new doc
    const clientDoc = new Y.Doc();
    const responseUpdate = decodeSyncStep2(ws.sent[0]);
    Y.applyUpdate(clientDoc, responseUpdate);
    expect(clientDoc.getMap('test').get('key')).toBe('value');
  });

  it('2.1.3 corrupted state — falls back to full state', async () => {
    const doc = new Y.Doc();
    doc.getMap('test').set('key', 'value');
    const storedState = Y.encodeStateAsUpdate(doc);
    vi.mocked(loadState).mockResolvedValueOnce(storedState);
    const ws = mockWebSocket();

    // Send garbage as state vector to make diffUpdate fail
    const garbageVector = new Uint8Array([255, 255, 255, 255]);
    await handleMessage(ctx, ws as any, buildSyncStep1(garbageVector));

    expect(ws.sent).toHaveLength(1);
    // Should still be usable (full state fallback)
    const clientDoc = new Y.Doc();
    const responseUpdate = decodeSyncStep2(ws.sent[0]);
    Y.applyUpdate(clientDoc, responseUpdate);
    expect(clientDoc.getMap('test').get('key')).toBe('value');
  });
});

describe('handleMessage — sync update', () => {
  it('2.1.4 first update, no DB state — pendingState is raw update', async () => {
    vi.mocked(loadState).mockResolvedValueOnce(null);
    const ws = mockWebSocket();
    // Need a collab session to exist
    joinCollab(ctx);

    const doc = new Y.Doc();
    doc.getMap('test').set('key', 'value');
    const update = Y.encodeStateAsUpdate(doc);

    await handleMessage(ctx, ws as any, buildSyncUpdate(update));

    const collab = getCollab(ctx.entityType, ctx.entityId);
    expect(collab.pendingState).toBeDefined();
    expect(collab.pendingState.length).toBeGreaterThan(0);
  });

  it('2.1.5 first update with DB state — merges', async () => {
    const existingDoc = new Y.Doc();
    existingDoc.getMap('test').set('existing', true);
    vi.mocked(loadState).mockResolvedValueOnce(Y.encodeStateAsUpdate(existingDoc));
    const ws = mockWebSocket();
    joinCollab(ctx);

    const newDoc = new Y.Doc();
    newDoc.getMap('test').set('new', true);
    const update = Y.encodeStateAsUpdate(newDoc);

    await handleMessage(ctx, ws as any, buildSyncUpdate(update));

    const collab = getCollab(ctx.entityType, ctx.entityId);
    // Verify merged state contains both keys
    const verifyDoc = new Y.Doc();
    Y.applyUpdate(verifyDoc, collab.pendingState);
    expect(verifyDoc.getMap('test').get('existing')).toBe(true);
    expect(verifyDoc.getMap('test').get('new')).toBe(true);
  });

  it('2.1.6 subsequent update — merges with pending', async () => {
    const ws = mockWebSocket();
    const collab = joinCollab(ctx);

    const doc1 = new Y.Doc();
    doc1.getMap('test').set('first', true);
    collab.pendingState = Y.encodeStateAsUpdate(doc1);

    const doc2 = new Y.Doc();
    doc2.getMap('test').set('second', true);
    const update = Y.encodeStateAsUpdate(doc2);

    await handleMessage(ctx, ws as any, buildSyncUpdate(update));

    const verifyDoc = new Y.Doc();
    Y.applyUpdate(verifyDoc, collab.pendingState);
    expect(verifyDoc.getMap('test').get('first')).toBe(true);
    expect(verifyDoc.getMap('test').get('second')).toBe(true);
  });

  it('2.1.8 merge failure with DB state — falls back to raw update', async () => {
    // Provide corrupted DB state that will cause mergeUpdates to fail
    vi.mocked(loadState).mockResolvedValueOnce(new Uint8Array([255, 255, 255]));
    const ws = mockWebSocket();
    joinCollab(ctx);

    const doc = new Y.Doc();
    doc.getMap('test').set('key', 'value');
    const update = Y.encodeStateAsUpdate(doc);

    await handleMessage(ctx, ws as any, buildSyncUpdate(update));

    const collab = getCollab(ctx.entityType, ctx.entityId);
    // Should have fallen back to raw update
    expect(collab.pendingState).toBeDefined();
    const verifyDoc = new Y.Doc();
    Y.applyUpdate(verifyDoc, collab.pendingState);
    expect(verifyDoc.getMap('test').get('key')).toBe('value');
  });

  it('2.1.9 broadcasts raw message to peers', async () => {
    vi.mocked(loadState).mockResolvedValueOnce(null);
    const ws = mockWebSocket();
    joinCollab(ctx);

    const doc = new Y.Doc();
    doc.getMap('test').set('key', 'value');
    const rawMessage = buildSyncUpdate(Y.encodeStateAsUpdate(doc));

    await handleMessage(ctx, ws as any, rawMessage);

    expect(broadcastToCollab).toHaveBeenCalledWith(ctx.entityType, ctx.entityId, rawMessage, ws);
  });
});

describe('handleMessage — input validation', () => {
  it('2.1.9 messages < 2 bytes are silently dropped', async () => {
    const ws = mockWebSocket();
    await handleMessage(ctx, ws as any, new Uint8Array([0]));
    await handleMessage(ctx, ws as any, new Uint8Array([]));
    expect(ws.sent).toHaveLength(0);
    expect(loadState).not.toHaveBeenCalled();
  });

  it('2.1.10 unknown message type is silently dropped', async () => {
    const ws = mockWebSocket();
    // Message type 99
    const data = new Uint8Array([99, 0, 0]);
    await handleMessage(ctx, ws as any, data);
    expect(ws.sent).toHaveLength(0);
    expect(loadState).not.toHaveBeenCalled();
  });
});

describe('handleMessage — awareness', () => {
  it('3.1.4 awareness is broadcast to peers', async () => {
    const ws = mockWebSocket();
    const awarenessData = buildAwarenessMessage(new Uint8Array([1, 2, 3]));

    await handleMessage(ctx, ws as any, awarenessData);

    expect(broadcastToCollab).toHaveBeenCalledWith(ctx.entityType, ctx.entityId, awarenessData, ws);
  });

  it('3.1.5 awareness rate limit enforced', async () => {
    const ws = mockWebSocket();
    const awarenessData = buildAwarenessMessage(new Uint8Array([1, 2, 3]));

    // Send 20 messages rapidly (within 1 second)
    for (let i = 0; i < 20; i++) {
      await handleMessage(ctx, ws as any, awarenessData);
    }

    // Only the first should pass (all sent at same fake time)
    expect(broadcastToCollab).toHaveBeenCalledTimes(1);
  });

  it('3.1.6 awareness rate limit is per-client', async () => {
    const ws1 = mockWebSocket();
    const ws2 = mockWebSocket();
    const awarenessData = buildAwarenessMessage(new Uint8Array([1, 2, 3]));

    await handleMessage(ctx, ws1 as any, awarenessData);
    await handleMessage(ctx, ws2 as any, awarenessData);

    expect(broadcastToCollab).toHaveBeenCalledTimes(2);
  });
});

describe('debounced save', () => {
  it('2.2.1 save fires after debounce period', async () => {
    vi.mocked(loadState).mockResolvedValue(null);
    const ws = mockWebSocket();
    joinCollab(ctx);

    const doc = new Y.Doc();
    doc.getMap('test').set('key', 'value');
    await handleMessage(ctx, ws as any, buildSyncUpdate(Y.encodeStateAsUpdate(doc)));

    expect(saveState).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(3000);

    expect(saveState).toHaveBeenCalledTimes(1);
  });

  it('2.2.1b materialization runs once per save window with the saved state and last editor', async () => {
    vi.mocked(loadState).mockResolvedValue(null);
    const ws = mockWebSocket();
    const collab = joinCollab(ctx);

    const doc = new Y.Doc();
    doc.getMap('test').set('key', 'value');
    const update = Y.encodeStateAsUpdate(doc);
    await handleMessage(ctx, ws as any, buildSyncUpdate(update));

    expect(materializeState).not.toHaveBeenCalled();
    expect(collab.lastEditor).toBe(ctx);

    await vi.advanceTimersByTimeAsync(3000);

    expect(materializeState).toHaveBeenCalledTimes(1);
    expect(materializeState).toHaveBeenCalledWith(collab, update);
    // saveState carries the last editor for crash-orphan attribution
    expect(saveState).toHaveBeenCalledWith(ctx, update, ctx.userId);
  });

  it('2.2.2 rapid updates reset debounce — single save', async () => {
    vi.mocked(loadState).mockResolvedValue(null);
    const ws = mockWebSocket();
    joinCollab(ctx);

    for (let i = 0; i < 5; i++) {
      const doc = new Y.Doc();
      doc.getMap('test').set(`key-${i}`, i);
      await handleMessage(ctx, ws as any, buildSyncUpdate(Y.encodeStateAsUpdate(doc)));
      await vi.advanceTimersByTimeAsync(500); // within 3000ms debounce
    }

    // Timer hasn't fully elapsed yet from the last update
    expect(saveState).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(3000);

    expect(saveState).toHaveBeenCalledTimes(1);
  });

  it('2.2.3 save failure restores pending state', async () => {
    vi.mocked(loadState).mockResolvedValue(null);
    vi.mocked(saveState).mockRejectedValueOnce(new Error('DB error'));
    const ws = mockWebSocket();
    joinCollab(ctx);

    const doc = new Y.Doc();
    doc.getMap('test').set('key', 'value');
    await handleMessage(ctx, ws as any, buildSyncUpdate(Y.encodeStateAsUpdate(doc)));

    await vi.advanceTimersByTimeAsync(3000);

    expect(saveState).toHaveBeenCalledTimes(1);
    // Pending state should be restored for retry
    const collab = getCollab(ctx.entityType, ctx.entityId);
    expect(collab.pendingState).toBeDefined();
  });

  it('2.2.4 save clears pending state on success', async () => {
    vi.mocked(loadState).mockResolvedValue(null);
    vi.mocked(saveState).mockResolvedValue(undefined);
    const ws = mockWebSocket();
    joinCollab(ctx);

    const doc = new Y.Doc();
    doc.getMap('test').set('key', 'value');
    await handleMessage(ctx, ws as any, buildSyncUpdate(Y.encodeStateAsUpdate(doc)));

    await vi.advanceTimersByTimeAsync(3000);

    const collab = getCollab(ctx.entityType, ctx.entityId);
    expect(collab.pendingState).toBeUndefined();
  });

  it('2.2.5 save sets and clears savingPromise', async () => {
    vi.mocked(loadState).mockResolvedValue(null);
    vi.mocked(saveState).mockResolvedValue(undefined);
    const ws = mockWebSocket();
    joinCollab(ctx);

    const doc = new Y.Doc();
    doc.getMap('test').set('key', 'value');
    await handleMessage(ctx, ws as any, buildSyncUpdate(Y.encodeStateAsUpdate(doc)));

    await vi.advanceTimersByTimeAsync(3000);

    const collab = getCollab(ctx.entityType, ctx.entityId);
    expect(collab.savingPromise).toBeUndefined();
  });

  it('2.2.6 DB state is cached within debounce window — single loadState call', async () => {
    vi.mocked(loadState).mockResolvedValue(null);
    const ws = mockWebSocket();
    joinCollab(ctx);

    // Send 3 updates rapidly, all within the debounce window, no pendingState yet each time.
    // First update sets pendingState, subsequent updates merge into it,
    // so loadState should only be called once (on the first update).
    const doc = new Y.Doc();
    doc.getMap('test').set('key', 'value');
    await handleMessage(ctx, ws as any, buildSyncUpdate(Y.encodeStateAsUpdate(doc)));

    expect(loadState).toHaveBeenCalledTimes(1);

    // Second and third updates merge into pendingState: no loadState needed
    doc.getMap('test').set('key2', 'value2');
    await handleMessage(ctx, ws as any, buildSyncUpdate(Y.encodeStateAsUpdate(doc)));
    doc.getMap('test').set('key3', 'value3');
    await handleMessage(ctx, ws as any, buildSyncUpdate(Y.encodeStateAsUpdate(doc)));

    expect(loadState).toHaveBeenCalledTimes(1);
  });

  it('2.2.7 DB state cache is cleared after save completes', async () => {
    vi.mocked(loadState).mockResolvedValue(null);
    vi.mocked(saveState).mockResolvedValue(undefined);
    const ws = mockWebSocket();
    joinCollab(ctx);

    const doc = new Y.Doc();
    doc.getMap('test').set('key', 'value');
    await handleMessage(ctx, ws as any, buildSyncUpdate(Y.encodeStateAsUpdate(doc)));

    // Flush the debounced save
    await vi.advanceTimersByTimeAsync(3000);
    expect(saveState).toHaveBeenCalledTimes(1);

    // Cache should be cleared: next update re-queries DB
    const collab = getCollab(ctx.entityType, ctx.entityId);
    expect(collab.cachedDbState).toBeUndefined();
  });
});
