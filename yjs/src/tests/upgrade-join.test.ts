import { createServer } from 'node:http';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { WebSocketServer, WebSocket as WsWebSocket } from 'ws';
import type { DocContext } from '../constants';
import { buildAwarenessMessage, buildSyncUpdate, createSignedToken, fakeStorage, mapUpdate } from './helpers';

// The real upgrade handler, relay and session manager over in-memory storage. Entity access is decided per user.
const gates = new Map<string, { delayMs: number; allowed: boolean }>();
vi.mock('../data/permissions', () => ({
  canEditEntity: vi.fn(async (ctx: DocContext) => {
    const gate = gates.get(ctx.userId) ?? { delayMs: 0, allowed: true };
    if (gate.delayMs) await new Promise((resolve) => setTimeout(resolve, gate.delayMs));
    return gate.allowed;
  }),
}));
const storage = fakeStorage();
vi.mock('../data/storage', () => storage);
vi.mock('../data/entity-content', () => ({ loadEntityDescription: vi.fn(async () => null) }));
vi.mock('../sync/materialize', () => ({
  postMaterialize: vi.fn(async () => 'ok'),
  stateToBlocksJson: vi.fn(() => '[]'),
}));
vi.mock('../server/rate-limiter', () => ({ checkConnectionRate: vi.fn(async () => true) }));

const { setupConnectionHandler, setupUpgradeHandler } = await import('../server/upgrade');
const { getCollab } = await import('../sync/session-manager');

const entityType = 'task';
let baseUrl: string;
let httpServer: ReturnType<typeof createServer>;
let wss: WebSocketServer;
const usedDocs = new Set<string>();

beforeAll(async () => {
  httpServer = createServer((_req, res) => {
    res.writeHead(404);
    res.end();
  });
  wss = new WebSocketServer({ noServer: true });
  httpServer.on('upgrade', setupUpgradeHandler(wss));
  setupConnectionHandler(wss);
  await new Promise<void>((resolve) => {
    httpServer.listen(0, '127.0.0.1', () => {
      const addr = httpServer.address();
      baseUrl = `ws://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}`;
      resolve();
    });
  });
});

afterEach(() => {
  for (const client of wss.clients) client.terminate();
  gates.clear();
});

afterAll(() => {
  // The relay arms compaction and cleanup timers per document; none may outlive the file.
  for (const entityId of usedDocs) {
    const collab = getCollab(entityType, entityId);
    if (collab?.compactTimer) clearTimeout(collab.compactTimer);
    if (collab?.cleanupTimer) clearTimeout(collab.cleanupTimer);
  }
  wss.close();
  httpServer.close();
});

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function until(check: () => boolean, ms = 2000): Promise<void> {
  const deadline = Date.now() + ms;
  while (!check()) {
    if (Date.now() > deadline) throw new Error('condition not met in time');
    await wait(10);
  }
}

const clientCount = (entityId: string) => getCollab(entityType, entityId)?.clients.size ?? 0;

/** An open client socket on the document; `received` collects every frame the relay sends it. */
async function open(userId: string, entityId: string) {
  usedDocs.add(entityId);
  const token = createSignedToken({ userId, entityType, entityId });
  const ws = new WsWebSocket(`${baseUrl}/${entityId}?token=${token}&entityType=${entityType}&tenantId=tenant-1`);
  const received: Uint8Array[] = [];
  ws.on('message', (data: Buffer) => received.push(new Uint8Array(data)));
  const closed = new Promise<number>((resolve) => ws.on('close', (code) => resolve(code)));
  await new Promise<void>((resolve, reject) => {
    ws.once('open', () => resolve());
    ws.once('error', reject);
  });
  return { ws, received, closed };
}

describe('upgrade: a socket joins its document only once verified', () => {
  it("must not relay a peer's edits to a socket still pending verification", async () => {
    const doc = 'doc-pending-edits';
    const editor = await open('user-a', doc);
    await until(() => clientCount(doc) === 1);

    gates.set('user-b', { delayMs: 250, allowed: true });
    const pending = await open('user-b', doc);
    editor.ws.send(buildSyncUpdate(mapUpdate('k', 1)));
    await until(() => storage.logs.get(`${entityType}:${doc}`)?.length === 1);
    await wait(50);
    expect(pending.received).toHaveLength(0);

    // Positive control: once verified, the socket receives the next edit.
    await until(() => clientCount(doc) === 2);
    const next = buildSyncUpdate(mapUpdate('k', 2));
    editor.ws.send(next);
    await until(() => pending.received.length === 1);
    expect(pending.received[0]).toEqual(next);
  });

  it('must not relay presence from a socket pending verification, nor ever from a denied one', async () => {
    const doc = 'doc-pending-presence';
    const peer = await open('user-a', doc);
    await until(() => clientCount(doc) === 1);

    gates.set('user-c', { delayMs: 250, allowed: true });
    gates.set('user-x', { delayMs: 60, allowed: false });
    const pending = await open('user-c', doc);
    const denied = await open('user-x', doc);
    pending.ws.send(buildAwarenessMessage(new Uint8Array([1])));
    const latest = buildAwarenessMessage(new Uint8Array([2]));
    pending.ws.send(latest);
    denied.ws.send(buildAwarenessMessage(new Uint8Array([9])));
    expect(await denied.closed).toBe(4003);
    await wait(50);
    expect(peer.received).toHaveLength(0);

    // Positive control: once verified, the socket's latest presence reaches its peer, the denied socket's never.
    await until(() => clientCount(doc) === 2);
    await until(() => peer.received.length === 1);
    await wait(50);
    expect(peer.received).toEqual([latest]);
  });

  it('must not relay presence from a socket the server is closing', async () => {
    const doc = 'doc-closing-presence';
    const peer = await open('user-a', doc);
    await until(() => clientCount(doc) === 1);
    await open('user-f', doc);
    await until(() => clientCount(doc) === 2);

    // ws still emits frames that arrive after the server started closing; one is replayed on the closing socket.
    const [, closing] = [...(getCollab(entityType, doc)?.clients ?? [])];
    closing.close(1000);
    expect(closing.readyState).toBe(WsWebSocket.CLOSING);
    closing.emit('message', Buffer.from(buildAwarenessMessage(new Uint8Array([3]))), false);
    await wait(50);
    expect(peer.received).toHaveLength(0);
  });

  it('must not take the session context from a denied first joiner', async () => {
    const doc = 'doc-denied-first';
    gates.set('user-d', { delayMs: 120, allowed: false });
    const denied = await open('user-d', doc);
    // The rightful editor arrives second and is verified first.
    await open('user-v', doc);
    await until(() => clientCount(doc) === 1);

    expect(await denied.closed).toBe(4003);
    const collab = getCollab(entityType, doc);
    expect(collab?.ctx.userId).toBe('user-v');
    expect(collab?.ctx.verified).toBe(true);
    expect(collab?.clients.size).toBe(1);
  });

  it('must not open a document session for a denied socket', async () => {
    const doc = 'doc-denied-alone';
    gates.set('user-e', { delayMs: 0, allowed: false });
    const denied = await open('user-e', doc);
    denied.ws.send(buildSyncUpdate(mapUpdate('k', 1)));

    expect(await denied.closed).toBe(4003);
    await wait(30);
    expect(getCollab(entityType, doc)).toBeUndefined();
    expect(storage.logs.get(`${entityType}:${doc}`)).toBeUndefined();
  });
});
