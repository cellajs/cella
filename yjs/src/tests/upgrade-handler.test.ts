import { createServer } from 'node:http';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { WebSocketServer, WebSocket as WsWebSocket } from 'ws';
import { createExpiredToken, createSignedToken } from './helpers';

// The real upgrade handler over mocked collaborators: entity access is granted, the relay and session manager are inert.
vi.mock('../data/permissions', () => ({ canEditEntity: vi.fn(async () => true) }));
vi.mock('../sync/relay', () => ({
  discardPendingBuffer: vi.fn(),
  handleMessage: vi.fn(),
  releaseBufferedMessages: vi.fn(),
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
