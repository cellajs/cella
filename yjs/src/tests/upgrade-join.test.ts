import { setTimeout as sleep } from 'node:timers/promises';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { WebSocket as WsWebSocket } from 'ws';
import type { DocScope } from '../constants';
import {
  awarenessUpdate,
  buildAwarenessMessage,
  buildSyncUpdate,
  createSignedToken,
  deferred,
  fakeStorage,
  mapUpdate,
  openSocket,
  recordCrashes,
  startRelayServer,
  storageKey,
  until,
} from './helpers';

// The real upgrade handler, relay and session manager over in-memory storage. Entity access is decided per user;
// every entity row sits in tenant-1 / org-1, and authorization returns the row's scope, never the token's.
const gates = new Map<string, { delayMs: number; allowed: boolean }>();
vi.mock('../data/permissions', () => ({
  authorizeDoc: vi.fn(async (userId: string, requested: DocScope) => {
    const gate = gates.get(userId) ?? { delayMs: 0, allowed: true };
    if (gate.delayMs) await new Promise((resolve) => setTimeout(resolve, gate.delayMs));
    if (!gate.allowed || requested.tenantId !== 'tenant-1') return null;
    return {
      entityType: requested.entityType,
      entityId: requested.entityId,
      tenantId: 'tenant-1',
      organizationId: 'org-1',
    };
  }),
}));
// A test holds appends open to leave frames waiting in a socket's queue.
let appendHold: ReturnType<typeof deferred> | null = null;
const storage = fakeStorage((call) => (call === 'appendUpdate' ? appendHold?.promise : undefined));
vi.mock('../data/storage', () => storage);
vi.mock('../data/entity-content', () => ({ loadEntityDescription: vi.fn(async () => null) }));
vi.mock('../sync/materialize', () => ({
  postMaterialize: vi.fn(async () => 'ok'),
  stateToBlocksJson: vi.fn(() => '[]'),
}));
vi.mock('../server/rate-limiter', () => ({ checkConnectionRate: vi.fn(async () => true) }));

const { getCollab } = await import('../sync/session-manager');

const entityType = 'task';
/** A document of tenant-1, as the relay keys its session and rows. */
const docOf = (entityId: string) => ({ entityType, entityId, tenantId: 'tenant-1' });
const relay = await startRelayServer();
const usedDocs = new Set<string>();

afterEach(() => {
  for (const client of relay.wss.clients) client.terminate();
  gates.clear();
});

afterAll(() => relay.close([...usedDocs].map(docOf)));

const clientCount = (entityId: string) => getCollab(docOf(entityId))?.clients.size ?? 0;

/** An open client socket of `userId` on the document, with a token naming `tenantId`. */
function open(userId: string, entityId: string, tenantId = 'tenant-1') {
  usedDocs.add(entityId);
  const token = createSignedToken({ userId, entityType, entityId, tenantId });
  return openSocket(`${relay.baseUrl}/${entityId}?token=${token}&entityType=${entityType}&tenantId=${tenantId}`);
}

describe('upgrade: a closing socket', () => {
  it('must not drop the updates a socket sent just before it closed', async () => {
    const doc = 'doc-drain';
    const editor = await open('user-a', doc);
    await until(() => clientCount(doc) === 1);

    // The first append is held, so the next two updates wait in the socket's queue when the client closes.
    appendHold = deferred();
    const appends = storage.appendUpdate.mock.calls.length;
    for (const key of ['a', 'b', 'c']) editor.ws.send(buildSyncUpdate(mapUpdate(key, 1)));
    await until(() => storage.appendUpdate.mock.calls.length === appends + 1);
    editor.ws.close(1000);
    await editor.closed;
    await sleep(20);
    appendHold.release();
    appendHold = null;

    await until(() => storage.logs.get(storageKey(docOf(doc)))?.length === 3);
    // The socket left its session once its updates were logged.
    await until(() => clientCount(doc) === 0);
  });
});

describe('upgrade: a frame no decoder accepts', () => {
  // A listener that throws is an uncaught exception: it ends the relay, and under singleVM the whole API.
  const crashes = recordCrashes();

  it('must not crash the relay via a frame whose message type is cut short', async () => {
    const doc = 'doc-malformed-frame';
    const peer = await open('user-a', doc);
    const sender = await open('user-b', doc);
    await until(() => clientCount(doc) === 2);

    sender.ws.send(Buffer.from([0x80, 0x80]));
    const outcome = await Promise.race([sender.closed, sleep(1000, 'still open')]);

    expect(outcome).toEqual({ code: 4400, reason: 'Malformed frame' });
    expect(crashes).toEqual([]);
    // Positive control: only the sender's socket closed, and the peer's next update is logged.
    peer.ws.send(buildSyncUpdate(mapUpdate('k', 1)));
    await until(() => storage.logs.get(storageKey(docOf(doc)))?.length === 1);
    expect(peer.ws.readyState).toBe(WsWebSocket.OPEN);
  });
});

describe('upgrade: a socket joins its document only once verified', () => {
  it("must not relay a peer's edits to a socket still pending verification", async () => {
    const doc = 'doc-pending-edits';
    const editor = await open('user-a', doc);
    await until(() => clientCount(doc) === 1);

    gates.set('user-b', { delayMs: 250, allowed: true });
    const pending = await open('user-b', doc);
    editor.ws.send(buildSyncUpdate(mapUpdate('k', 1)));
    await until(() => storage.logs.get(storageKey(docOf(doc)))?.length === 1);
    await sleep(50);
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
    pending.ws.send(buildAwarenessMessage(awarenessUpdate({ clientId: 1 })));
    const latest = buildAwarenessMessage(awarenessUpdate({ clientId: 1, clock: 2 }));
    pending.ws.send(latest);
    denied.ws.send(buildAwarenessMessage(awarenessUpdate({ clientId: 9 })));
    expect(await denied.closed).toEqual({ code: 4003, reason: 'Access denied' });
    await sleep(50);
    expect(peer.received).toHaveLength(0);

    // Positive control: once verified, the socket's latest presence reaches its peer, the denied socket's never.
    await until(() => clientCount(doc) === 2);
    await until(() => peer.received.length === 1);
    await sleep(50);
    expect(peer.received).toEqual([latest]);
  });

  it('must not relay presence from a socket the server is closing', async () => {
    const doc = 'doc-closing-presence';
    const peer = await open('user-a', doc);
    await until(() => clientCount(doc) === 1);
    await open('user-f', doc);
    await until(() => clientCount(doc) === 2);

    // ws still emits frames that arrive after the server started closing; one is replayed on the closing socket.
    const [, closing] = [...(getCollab(docOf(doc))?.clients ?? [])];
    closing.close(1000);
    expect(closing.readyState).toBe(WsWebSocket.CLOSING);
    closing.emit('message', Buffer.from(buildAwarenessMessage(awarenessUpdate({ clientId: 3 }))), false);
    await sleep(50);
    expect(peer.received).toHaveLength(0);
  });

  it('must not take the session context from a denied first joiner', async () => {
    const doc = 'doc-denied-first';
    gates.set('user-d', { delayMs: 120, allowed: false });
    const denied = await open('user-d', doc);
    // The rightful editor arrives second and is verified first.
    await open('user-v', doc);
    await until(() => clientCount(doc) === 1);

    expect(await denied.closed).toEqual({ code: 4003, reason: 'Access denied' });
    const collab = getCollab(docOf(doc));
    // The session's scope is the entity row's, with no joiner in it: compaction and materialize act as the system.
    expect(collab?.scope).toEqual({ entityType, entityId: doc, tenantId: 'tenant-1', organizationId: 'org-1' });
    expect(collab?.clients.size).toBe(1);
  });

  it("must not open a session in another tenant's scope via a token naming that tenant", async () => {
    const doc = 'doc-forged-tenant';
    // The token names tenant-x, but the entity row is in tenant-1: authorization reads no such row there.
    const forged = await open('user-g', doc, 'tenant-x');
    forged.ws.send(buildSyncUpdate(mapUpdate('k', 1)));

    expect(await forged.closed).toEqual({ code: 4003, reason: 'Access denied' });
    await sleep(30);
    expect(getCollab({ entityType, entityId: doc, tenantId: 'tenant-x' })).toBeUndefined();
    expect(storage.logs.get(storageKey({ entityType, entityId: doc, tenantId: 'tenant-x' }))).toBeUndefined();

    // Positive control: the row's own tenant opens it, with a session keyed by that tenant.
    await open('user-h', doc);
    await until(() => clientCount(doc) === 1);
    expect(getCollab(docOf(doc))?.scope.tenantId).toBe('tenant-1');
  });

  it('must not open a document session for a denied socket', async () => {
    const doc = 'doc-denied-alone';
    gates.set('user-e', { delayMs: 0, allowed: false });
    const denied = await open('user-e', doc);
    denied.ws.send(buildSyncUpdate(mapUpdate('k', 1)));

    expect(await denied.closed).toEqual({ code: 4003, reason: 'Access denied' });
    await sleep(30);
    expect(getCollab(docOf(doc))).toBeUndefined();
    expect(storage.logs.get(storageKey(docOf(doc)))).toBeUndefined();
  });
});
