import { createHmac } from 'node:crypto';
import { createServer } from 'node:http';
import { type Socket, connect as tcpConnect } from 'node:net';
import type { Duplex } from 'node:stream';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { WebSocketServer, WebSocket as WsWebSocket } from 'ws';
import { createExpiredToken, createSignedToken, deferred } from './helpers';

// The real upgrade handler over mocked collaborators: entity access is granted in the requested scope, the relay and session manager are inert.
const verifyGate = { delayMs: 0, allowed: true };
vi.mock('../data/permissions', () => ({
  authorizeDoc: vi.fn(async (_userId: string, requested: unknown) => {
    if (verifyGate.delayMs) await new Promise((resolve) => setTimeout(resolve, verifyGate.delayMs));
    return verifyGate.allowed ? requested : null;
  }),
}));
// Frames are recorded with the verification state they were applied under; awareness frames bypass the queue.
const applied: { type: number; verified: boolean; body: number }[] = [];
vi.mock('../sync/relay', () => ({
  YMessage: { Sync: 0, Awareness: 1 },
  peekMessageType: (data: Uint8Array) => (data.length < 2 ? null : data[0]),
  handleMessage: vi.fn(async (ctx: { scope: unknown }, _ws: unknown, data: Uint8Array) => {
    // A slow first frame: later frames must still apply after it, in order.
    if (data[2] === 1) await new Promise((resolve) => setTimeout(resolve, 30));
    applied.push({ type: data[0], verified: ctx.scope !== null, body: data[2] });
  }),
}));
vi.mock('../sync/session-manager', () => ({ joinCollab: vi.fn(), leaveCollab: vi.fn() }));
vi.mock('../server/rate-limiter', () => ({ checkConnectionRate: vi.fn(async () => true) }));

const { setupConnectionHandler, setupUpgradeHandler } = await import('../server/upgrade');
const { checkConnectionRate } = await import('../server/rate-limiter');

let baseUrl: string;
let port: number;
let httpServer: ReturnType<typeof createServer>;
let wss: WebSocketServer;
/** The server's side of every upgrade request, in arrival order. */
const upgradeSockets: Duplex[] = [];

beforeAll(async () => {
  httpServer = createServer((_req, res) => {
    res.writeHead(404);
    res.end();
  });
  wss = new WebSocketServer({ noServer: true });
  httpServer.on('upgrade', setupUpgradeHandler(wss));
  httpServer.on('upgrade', (_req, socket) => upgradeSockets.push(socket));
  setupConnectionHandler(wss);

  await new Promise<void>((resolve) => {
    httpServer.listen(0, '127.0.0.1', () => {
      const addr = httpServer.address();
      port = typeof addr === 'object' && addr ? addr.port : 0;
      baseUrl = `ws://127.0.0.1:${port}`;
      resolve();
    });
  });
});

afterAll(() => {
  for (const client of wss.clients) client.close(1001);
  wss.close();
  httpServer.close();
});

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
    const { closeCode, closeReason, error } = await connect(
      `/entity-1?token=${token}&entityType=task&tenantId=tenant-1`,
    );

    expect(error).toBeUndefined();
    expect(closeCode).toBe(4001);
    expect(closeReason).toBe('Invalid or expired token');
  });

  it('closes a token signed with another key after the handshake with 4001', async () => {
    const token = createSignedToken({ userId: 'user-1', keyMaterial: 'another-key-material-of-32-characters' });
    const { closeCode } = await connect(`/entity-1?token=${token}&entityType=task&tenantId=tenant-1`);

    expect(closeCode).toBe(4001);
  });

  it('must not accept a connection with a token minted with the relay secret', async () => {
    const payloadB64 = Buffer.from(
      JSON.stringify({
        userId: 'user-1',
        entityType: 'task',
        entityId: 'entity-1',
        tenantId: 'tenant-1',
        organizationId: 'org-1',
        exp: Date.now() + 60_000,
      }),
    ).toString('base64url');
    const mac = createHmac('sha256', 'test-yjs-relay-secret-for-unit-tests').update(payloadB64).digest('base64url');
    const { closeCode, closeReason } = await connect(
      `/entity-1?token=${payloadB64}.${mac}&entityType=task&tenantId=tenant-1`,
    );

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
    const short = new WsWebSocket(`${baseUrl}/entity-1?token=${expiring}&entityType=task&tenantId=tenant-1`);
    const long = new WsWebSocket(`${baseUrl}/entity-1?token=${lasting}&entityType=task&tenantId=tenant-1`);
    const closed = new Promise<{ code: number; reason: string }>((resolve) =>
      short.on('close', (code, reason) => resolve({ code, reason: reason.toString() })),
    );
    await Promise.all([short, long].map((ws) => new Promise((resolve) => ws.once('open', resolve))));

    // The client refetches its token on 4001 and reconnects; revoked access gets no new token.
    expect(await closed).toEqual({ code: 4001, reason: 'Token expired' });
    // Positive control: a socket whose token is still valid stays open.
    expect(long.readyState).toBe(WsWebSocket.OPEN);
    long.close();
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

/** Polls until `check` holds, failing after `ms`. */
async function until(check: () => boolean, ms = 2000): Promise<void> {
  const deadline = Date.now() + ms;
  while (!check()) {
    if (Date.now() > deadline) throw new Error('condition not met in time');
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

/** An upgrade request on a plain TCP socket, so a test can reset the connection at any moment; `response` resolves the head the server sent, if any. */
function rawUpgrade(target: string): { client: Socket; response: Promise<string> } {
  const client = tcpConnect(port, '127.0.0.1');
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
  // A socket 'error' without a listener, or a rejected upgrade handler, is what takes the process down.
  const crashes: unknown[] = [];
  const record = (err: unknown) => void crashes.push(err);
  const settle = () => new Promise((resolve) => setTimeout(resolve, 50));

  beforeAll(() => {
    process.on('uncaughtException', record);
    process.on('unhandledRejection', record);
  });

  afterAll(() => {
    process.off('uncaughtException', record);
    process.off('unhandledRejection', record);
  });

  afterEach(() => {
    crashes.length = 0;
  });

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
    // No token: refused at the HTTP level.
    const { client, response } = rawUpgrade('/entity-1?entityType=task&tenantId=tenant-1');
    expect((await response).split('\r\n')[0]).toBe('HTTP/1.1 400 Bad Request');
    const serverSide = upgradeSockets[seen];

    client.resetAndDestroy();
    await settle();

    expect(crashes).toEqual([]);
    // The refusal ends the connection itself: a peer that never closes cannot hold the socket open.
    expect(serverSide.destroyed).toBe(true);
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
  const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  afterEach(() => {
    applied.length = 0;
    verifyGate.delayMs = 0;
    verifyGate.allowed = true;
  });

  it('sync frames sent before verification wait for it and then apply in arrival order, one at a time', async () => {
    verifyGate.delayMs = 60;
    const token = createSignedToken({ userId: 'user-1', entityId: 'entity-order' });
    const ws = new WsWebSocket(`${baseUrl}/entity-order?token=${token}&entityType=task&tenantId=tenant-1`);
    await new Promise<void>((resolve) => ws.on('open', () => resolve()));

    // Three sync frames in one burst (the first is slow to apply) and one awareness frame, all before verification settles.
    ws.send(new Uint8Array([0, 2, 1]));
    ws.send(new Uint8Array([0, 2, 2]));
    ws.send(new Uint8Array([1, 0, 9]));
    ws.send(new Uint8Array([0, 2, 3]));
    await wait(40);
    // Nothing ran before verification: sync frames are held, and so is the presence frame.
    expect(applied).toEqual([]);

    await wait(150);
    // The join relays the held presence first, then the queue applies the sync frames.
    expect(applied).toEqual([
      { type: 1, verified: true, body: 9 },
      { type: 0, verified: true, body: 1 },
      { type: 0, verified: true, body: 2 },
      { type: 0, verified: true, body: 3 },
    ]);

    // Presence from the joined socket goes through.
    ws.send(new Uint8Array([1, 0, 8]));
    await wait(30);
    expect(applied.at(-1)).toEqual({ type: 1, verified: true, body: 8 });
    ws.close();
  });

  it('denied verification closes the socket and never applies the queued sync frames', async () => {
    verifyGate.delayMs = 30;
    verifyGate.allowed = false;
    const token = createSignedToken({ userId: 'user-1', entityId: 'entity-denied' });
    const ws = new WsWebSocket(`${baseUrl}/entity-denied?token=${token}&entityType=task&tenantId=tenant-1`);
    const closed = new Promise<number>((resolve) => ws.on('close', (code) => resolve(code)));
    await new Promise<void>((resolve) => ws.on('open', () => resolve()));
    ws.send(new Uint8Array([0, 2, 5]));

    expect(await closed).toBe(4003);
    await wait(60);
    expect(applied.filter((frame) => frame.type === 0)).toHaveLength(0);
  });
});
