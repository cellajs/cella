import { createServer } from 'node:http';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { WebSocketServer, WebSocket as WsWebSocket } from 'ws';
import { createExpiredToken, createSignedToken } from './helpers';

// The real upgrade handler over mocked collaborators: entity access is granted, the relay and session manager are inert.
const verifyGate = { delayMs: 0, allowed: true };
vi.mock('../data/permissions', () => ({
  canEditEntity: vi.fn(async () => {
    if (verifyGate.delayMs) await new Promise((resolve) => setTimeout(resolve, verifyGate.delayMs));
    return verifyGate.allowed;
  }),
}));
// Sync frames are recorded with the verification state they were applied under; awareness frames bypass the queue.
const applied: { type: number; verified: boolean; body: number }[] = [];
vi.mock('../sync/relay', () => ({
  YMessage: { Sync: 0, Awareness: 1 },
  peekMessageType: (data: Uint8Array) => (data.length < 2 ? null : data[0]),
  handleMessage: vi.fn(async (ctx: { verified: boolean }, _ws: unknown, data: Uint8Array) => {
    // A slow first frame: later frames must still apply after it, in order.
    if (data[2] === 1) await new Promise((resolve) => setTimeout(resolve, 30));
    applied.push({ type: data[0], verified: ctx.verified, body: data[2] });
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

  it('closes a tampered token after the handshake with 4001', async () => {
    const token = createSignedToken({ userId: 'user-1', secret: 'another-secret-of-sixteen-chars' });
    const { closeCode } = await connect(`/entity-1?token=${token}&entityType=task&tenantId=tenant-1`);

    expect(closeCode).toBe(4001);
  });

  it('still rejects missing params at the HTTP level', async () => {
    const { error, closeCode } = await connect('/entity-1?entityType=task&tenantId=tenant-1');

    expect(closeCode).toBeUndefined();
    expect(error?.message).toContain('400');
  });

  it('still rejects a token for another tenant at the HTTP level', async () => {
    const token = createSignedToken({ userId: 'user-1', tenantId: 'tenant-2' });
    const { error } = await connect(`/entity-1?token=${token}&entityType=task&tenantId=tenant-1`);

    expect(error?.message).toContain('400');
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
    const token = createSignedToken({ userId: 'user-1' });
    const ws = new WsWebSocket(`${baseUrl}/entity-order?token=${token}&entityType=task&tenantId=tenant-1`);
    await new Promise<void>((resolve) => ws.on('open', () => resolve()));

    // Three sync frames in one burst (the first is slow to apply) and one awareness frame, all before verification settles.
    ws.send(new Uint8Array([0, 2, 1]));
    ws.send(new Uint8Array([0, 2, 2]));
    ws.send(new Uint8Array([1, 0, 9]));
    ws.send(new Uint8Array([0, 2, 3]));
    await wait(40);
    // Awareness bypassed the queue and ran unverified; sync frames are still held.
    expect(applied).toEqual([{ type: 1, verified: false, body: 9 }]);

    await wait(150);
    expect(applied.slice(1)).toEqual([
      { type: 0, verified: true, body: 1 },
      { type: 0, verified: true, body: 2 },
      { type: 0, verified: true, body: 3 },
    ]);
    ws.close();
  });

  it('denied verification closes the socket and never applies the queued sync frames', async () => {
    verifyGate.delayMs = 30;
    verifyGate.allowed = false;
    const token = createSignedToken({ userId: 'user-1' });
    const ws = new WsWebSocket(`${baseUrl}/entity-denied?token=${token}&entityType=task&tenantId=tenant-1`);
    const closed = new Promise<number>((resolve) => ws.on('close', (code) => resolve(code)));
    await new Promise<void>((resolve) => ws.on('open', () => resolve()));
    ws.send(new Uint8Array([0, 2, 5]));

    expect(await closed).toBe(4003);
    await wait(60);
    expect(applied.filter((frame) => frame.type === 0)).toHaveLength(0);
  });
});
