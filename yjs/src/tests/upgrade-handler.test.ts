import { type Socket, connect as tcpConnect } from 'node:net';
import type { Duplex } from 'node:stream';
import { setTimeout as sleep } from 'node:timers/promises';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { WebSocket as WsWebSocket } from 'ws';
import { createExpiredToken, createSignedToken, deferred, openSocket, recordCrashes, startRelayServer, until } from './helpers';

// The real upgrade handler over mocked collaborators: entity access is granted in the requested scope, the relay and session manager are inert.
// `hold` keeps a verification pending until the test releases it; `error` makes it fail, as an unreachable database does.
const verifyGate: { delayMs: number; allowed: boolean; hold: Promise<void> | null; error: Error | null } = {
  delayMs: 0,
  allowed: true,
  hold: null,
  error: null,
};
vi.mock('../data/permissions', () => ({
  authorizeDoc: vi.fn(async (_userId: string, requested: unknown) => {
    if (verifyGate.hold) await verifyGate.hold;
    if (verifyGate.delayMs) await new Promise((resolve) => setTimeout(resolve, verifyGate.delayMs));
    if (verifyGate.error) throw verifyGate.error;
    return verifyGate.allowed ? requested : null;
  }),
}));
// Frames are recorded with the verification state they were applied under; awareness frames bypass the queue.
const applied: { type: number; verified: boolean; body: number }[] = [];
// A frame starting with 0xff stands for one the relay throws on.
vi.mock('../sync/relay', () => ({
  YMessage: { Sync: 0, Awareness: 1 },
  peekMessageType: (data: Uint8Array) => {
    if (data[0] === 0xff) throw new Error('relay failure');
    return data.length === 0 ? null : data[0];
  },
  refuseFrame: (_scope: unknown, _userId: string, ws: { close: (code: number, reason: string) => void }) => ws.close(4400, 'Malformed frame'),
  handleMessage: vi.fn(async (ctx: { scope: unknown }, _ws: unknown, data: Uint8Array) => {
    // A slow first frame: later frames must still apply after it, in order.
    if (data[2] === 1) await new Promise((resolve) => setTimeout(resolve, 30));
    applied.push({ type: data[0], verified: ctx.scope !== null, body: data[2] });
  }),
}));
vi.mock('../sync/session-manager', () => ({ joinCollab: vi.fn(), leaveCollab: vi.fn() }));
vi.mock('../server/rate-limiter', () => ({ checkConnectionRate: vi.fn(async () => true) }));

const { checkConnectionRate } = await import('../server/rate-limiter');

const relay = await startRelayServer();
const { baseUrl, port, wss } = relay;
/** The server's side of every upgrade request, in arrival order. */
const upgradeSockets: Duplex[] = [];
relay.httpServer.on('upgrade', (_req, socket) => upgradeSockets.push(socket));

afterAll(() => relay.close());

/** Connects and settles on a stable open socket, a close code, or an HTTP-level error. */
function connect(path: string): Promise<{ ws: WsWebSocket; closeCode?: number; closeReason?: string; error?: Error }> {
  return new Promise((resolve, reject) => {
    const ws = new WsWebSocket(`${baseUrl}${path}`);
    const timeout = setTimeout(() => reject(new Error('Connection timeout')), 5000);
    ws.on('open', () => {
      setTimeout(() => {
        if (ws.readyState === WsWebSocket.OPEN) {
          clearTimeout(timeout);
          resolve({ ws });
        }
      }, 100);
    });
    ws.on('close', (code, reason) => {
      clearTimeout(timeout);
      resolve({ ws, closeCode: code, closeReason: reason.toString() });
    });
    ws.on('error', (error) => {
      clearTimeout(timeout);
      resolve({ ws, error });
    });
  });
}

describe('setupUpgradeHandler', () => {
  it('closes an expired token after the handshake with 4001, so a browser client sees the code', async () => {
    const token = createExpiredToken('user-1');
    const { closeCode, closeReason, error } = await connect(`/entity-1?token=${token}&entityType=task&tenantId=tenant-1`);

    expect(error).toBeUndefined();
    expect(closeCode).toBe(4001);
    expect(closeReason).toBe('Invalid or expired token');
  });

  it('must not open a connection via a token another key signed: it closes with 4001 after the handshake', async () => {
    // Every signature verifyToken refuses (a relay-secret MAC included, auth.test.ts) takes this one path.
    const token = createSignedToken({ userId: 'user-1', keyMaterial: 'another-key-material-of-32-characters' });
    const { closeCode, closeReason } = await connect(`/entity-1?token=${token}&entityType=task&tenantId=tenant-1`);

    expect(closeCode).toBe(4001);
    expect(closeReason).toBe('Invalid or expired token');
  });

  it('still rejects missing params at the HTTP level', async () => {
    const { error, closeCode } = await connect('/entity-1?entityType=task&tenantId=tenant-1');

    expect(closeCode).toBeUndefined();
    expect(error?.message).toContain('400');
  });

  it('must not open a document with a token for another tenant', async () => {
    const token = createSignedToken({ userId: 'user-1', tenantId: 'tenant-2' });
    const { error } = await connect(`/entity-1?token=${token}&entityType=task&tenantId=tenant-1`);

    expect(error?.message).toContain('403');
  });

  it('must not open a document with a token for another entity', async () => {
    const token = createSignedToken({ userId: 'user-1', entityId: 'entity-2' });
    const { error, closeCode } = await connect(`/entity-1?token=${token}&entityType=task&tenantId=tenant-1`);

    expect(closeCode).toBeUndefined();
    expect(error?.message).toContain('403');
  });

  it('must not keep a socket open past its token expiry', async () => {
    const expiring = createSignedToken({ userId: 'user-1', exp: Date.now() + 400 });
    const lasting = createSignedToken({ userId: 'user-1' });
    const [short, long] = await Promise.all(
      [expiring, lasting].map((token) => openSocket(`${baseUrl}/entity-1?token=${token}&entityType=task&tenantId=tenant-1`)),
    );

    // The client refetches its token on 4001 and reconnects; revoked access gets no new token.
    expect(await short.closed).toEqual({ code: 4001, reason: 'Token expired' });
    // Positive control: a socket whose token is still valid stays open.
    expect(long.ws.readyState).toBe(WsWebSocket.OPEN);
    long.ws.close();
  });

  it('accepts a valid token', async () => {
    const token = createSignedToken({ userId: 'user-1' });
    const { ws, closeCode, error } = await connect(`/entity-1?token=${token}&entityType=task&tenantId=tenant-1`);

    expect(error).toBeUndefined();
    expect(closeCode).toBeUndefined();
    expect(ws.readyState).toBe(WsWebSocket.OPEN);
    ws.close();
  });
});

/**
 * An upgrade request on a plain TCP socket, so a test can reset the connection at any moment; `response` resolves the
 * head the server sent, if any. A `halfOpen` client keeps its side open after the server ends its own.
 */
function rawUpgrade(target: string, { halfOpen = false } = {}): { client: Socket; response: Promise<string> } {
  const client = tcpConnect({ port, host: '127.0.0.1', allowHalfOpen: halfOpen });
  client.on('error', () => {});
  let received = '';
  const response = new Promise<string>((resolve) => {
    client.on('data', (chunk) => {
      received += chunk.toString('latin1');
      if (received.includes('\r\n\r\n')) resolve(received);
    });
    client.on('close', () => resolve(received));
    // A server that never answers resolves as silence.
    setTimeout(() => resolve(received), 2000);
  });
  const lines = [
    `GET ${target} HTTP/1.1`,
    `Host: 127.0.0.1:${port}`,
    'Upgrade: websocket',
    'Connection: Upgrade',
    'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==',
    'Sec-WebSocket-Version: 13',
  ];
  client.write(`${lines.join('\r\n')}\r\n\r\n`);
  return { client, response };
}

describe('setupUpgradeHandler: a peer that resets or garbles the handshake', () => {
  const crashes = recordCrashes();
  const settle = () => sleep(50);

  /** Positive control for each case: the server still accepts a valid connection. */
  async function expectStillServing() {
    const token = createSignedToken({ userId: 'user-1' });
    const { ws, closeCode, error } = await connect(`/entity-1?token=${token}&entityType=task&tenantId=tenant-1`);
    expect(error).toBeUndefined();
    expect(closeCode).toBeUndefined();
    ws.close();
  }

  it('must not crash the process via a connection reset while the upgrade waits on the rate limiter', async () => {
    const limiter = deferred();
    const calls = vi.mocked(checkConnectionRate).mock.calls.length;
    vi.mocked(checkConnectionRate).mockImplementationOnce(async () => {
      await limiter.promise;
      return true;
    });
    const seen = upgradeSockets.length;
    const token = createSignedToken({ userId: 'user-1' });
    const { client } = rawUpgrade(`/entity-1?token=${token}&entityType=task&tenantId=tenant-1`);
    await until(() => vi.mocked(checkConnectionRate).mock.calls.length > calls && upgradeSockets.length > seen);
    const serverSide = upgradeSockets[seen];

    client.resetAndDestroy();
    await until(() => serverSide.destroyed);
    limiter.release();
    await settle();

    expect(crashes).toEqual([]);
    expect(wss.clients.size).toBe(0);
    await expectStillServing();
  });

  it('must not crash the process via a connection reset after a refused upgrade', async () => {
    const seen = upgradeSockets.length;
    // No token: refused at the HTTP level, to a peer that never closes its side of the connection.
    const { client, response } = rawUpgrade('/entity-1?entityType=task&tenantId=tenant-1', { halfOpen: true });
    expect((await response).split('\r\n')[0]).toBe('HTTP/1.1 400 Bad Request');
    const serverSide = upgradeSockets[seen];
    // The refusal ends the connection itself: a peer that never closes cannot hold the socket open.
    await until(() => serverSide.destroyed);

    client.resetAndDestroy();
    await settle();

    expect(crashes).toEqual([]);
    await expectStillServing();
  });

  it('must not crash the process via a malformed frame on a socket refused for its token', async () => {
    const token = createExpiredToken('user-1');
    const { client, response } = rawUpgrade(`/entity-1?token=${token}&entityType=task&tenantId=tenant-1`);
    expect((await response).split('\r\n')[0]).toBe('HTTP/1.1 101 Switching Protocols');

    // An unmasked frame: `ws` refuses every client frame without a mask and emits 'error' on the socket.
    client.write(Buffer.from([0x82, 0x00]));
    await settle();

    expect(crashes).toEqual([]);
    client.destroy();
    await expectStillServing();
  });

  it('must not crash the process via a frame the relay throws on: only its socket closes, with 1011', async () => {
    const token = createSignedToken({ userId: 'user-1', entityId: 'entity-throw' });
    const { ws, closed } = await openSocket(`${baseUrl}/entity-throw?token=${token}&entityType=task&tenantId=tenant-1`);

    ws.send(new Uint8Array([0xff, 0]));
    const outcome = await Promise.race([closed, sleep(1000, 'still open')]);

    expect(outcome).toEqual({ code: 1011, reason: 'Frame handling failed' });
    expect(crashes).toEqual([]);
    await expectStillServing();
  });

  it('must not leave a socket open or reject the handler via a request target no URL can hold', async () => {
    const seen = upgradeSockets.length;
    const token = createSignedToken({ userId: 'user-1' });
    const { response } = rawUpgrade(`//[/entity-1?token=${token}&entityType=task&tenantId=tenant-1`);

    expect((await response).split('\r\n')[0]).toBe('HTTP/1.1 400 Bad Request');
    await until(() => upgradeSockets[seen]?.destroyed === true);
    await settle();
    expect(crashes).toEqual([]);
    await expectStillServing();
  });
});

describe('setupConnectionHandler: per-socket ordering', () => {
  /** Frames the server's sockets received, counted apart from the handler, so a test knows they arrived. */
  let framesReceived = 0;

  beforeAll(() => {
    wss.on('connection', (ws) => ws.on('message', () => framesReceived++));
  });

  afterEach(() => {
    applied.length = 0;
    verifyGate.delayMs = 0;
    verifyGate.allowed = true;
    verifyGate.hold = null;
    verifyGate.error = null;
  });

  it('sync frames sent before verification wait for it and then apply in arrival order, one at a time', async () => {
    const verification = deferred();
    verifyGate.hold = verification.promise;
    const before = framesReceived;
    const token = createSignedToken({ userId: 'user-1', entityId: 'entity-order' });
    const { ws } = await openSocket(`${baseUrl}/entity-order?token=${token}&entityType=task&tenantId=tenant-1`);

    // Three sync frames in one burst (the first is slow to apply) and one awareness frame, all before verification settles.
    ws.send(new Uint8Array([0, 2, 1]));
    ws.send(new Uint8Array([0, 2, 2]));
    ws.send(new Uint8Array([1, 0, 9]));
    ws.send(new Uint8Array([0, 2, 3]));
    await until(() => framesReceived === before + 4);
    // Nothing ran before verification: sync frames are held, and so is the presence frame.
    expect(applied).toEqual([]);

    verification.release();
    await until(() => applied.length === 4);
    // The join relays the held presence first, then the queue applies the sync frames.
    expect(applied).toEqual([
      { type: 1, verified: true, body: 9 },
      { type: 0, verified: true, body: 1 },
      { type: 0, verified: true, body: 2 },
      { type: 0, verified: true, body: 3 },
    ]);

    // Presence from the joined socket goes through.
    ws.send(new Uint8Array([1, 0, 8]));
    await until(() => applied.length === 5);
    expect(applied.at(-1)).toEqual({ type: 1, verified: true, body: 8 });
    ws.close();
  });

  it('denied verification closes the socket and never applies the queued sync frames', async () => {
    const verification = deferred();
    verifyGate.hold = verification.promise;
    verifyGate.allowed = false;
    const before = framesReceived;
    const token = createSignedToken({ userId: 'user-1', entityId: 'entity-denied' });
    const { ws, closed } = await openSocket(`${baseUrl}/entity-denied?token=${token}&entityType=task&tenantId=tenant-1`);
    ws.send(new Uint8Array([0, 2, 5]));
    await until(() => framesReceived === before + 1);

    verification.release();
    expect(await closed).toEqual({ code: 4003, reason: 'Access denied' });
    await sleep(60);
    expect(applied.filter((frame) => frame.type === 0)).toHaveLength(0);
  });

  it('must not leave a socket open when its verification fails: it closes with 4503 and its queued frames never apply', async () => {
    const verification = deferred();
    verifyGate.hold = verification.promise;
    verifyGate.error = new Error('ECONNREFUSED');
    const before = framesReceived;
    const token = createSignedToken({ userId: 'user-1', entityId: 'entity-unavailable' });
    const { ws, closed } = await openSocket(`${baseUrl}/entity-unavailable?token=${token}&entityType=task&tenantId=tenant-1`);
    ws.send(new Uint8Array([0, 2, 6]));
    await until(() => framesReceived === before + 1);

    verification.release();
    const outcome = await Promise.race([closed, sleep(1000, 'still open')]);
    expect(outcome).toEqual({ code: 4503, reason: 'Authorization unavailable' });
    await sleep(60);
    expect(applied).toHaveLength(0);
  });
});
