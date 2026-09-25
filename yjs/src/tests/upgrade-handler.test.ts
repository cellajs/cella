import { createHmac } from 'node:crypto';
import { createServer } from 'node:http';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { WebSocketServer, WebSocket as WsWebSocket } from 'ws';
import { createExpiredToken, createSignedToken } from './helpers';

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

let baseUrl: string;
let httpServer: ReturnType<typeof createServer>;
let wss: WebSocketServer;

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

  it('accepts a valid token', async () => {
    const token = createSignedToken({ userId: 'user-1' });
    const { ws, closeCode, error } = await connect(`/entity-1?token=${token}&entityType=task&tenantId=tenant-1`);

    expect(error).toBeUndefined();
    expect(closeCode).toBeUndefined();
    expect(ws.readyState).toBe(WsWebSocket.OPEN);
    ws.close();
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
