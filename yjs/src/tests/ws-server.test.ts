import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createServer } from 'node:http';
import { URL } from 'node:url';
import { MissingScopeError } from 'shared';
import { WebSocketServer, WebSocket as WsWebSocket } from 'ws';
import { createSignedToken, createExpiredToken } from './helpers';

vi.mock('../lib/pino', () => ({
  log: {
    trace: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    fatal: vi.fn(),
  },
}));

const { verifyToken } = await import('../server/auth');

// Stands in for the relay's local authorization (`canEditEntity`). Tests drive its outcome:
// resolve(true) → allowed, resolve(false) → denied, reject(MissingScopeError) → missing scope,
// reject(Error) → DB/resolver failure.
const mockVerify = vi.fn();

let port: number;
let baseUrl: string;
let httpServer: ReturnType<typeof createServer>;
let wss: InstanceType<typeof WebSocketServer>;

/**
 * Reject the upgrade at the HTTP level — no WebSocket handshake is completed.
 */
function rejectAtHttp(
  _wsServer: WebSocketServer,
  _req: import('node:http').IncomingMessage,
  socket: import('node:stream').Duplex,
  _head: Buffer,
  code: number,
  reason: string,
) {
  if (socket.destroyed) return;
  const body = JSON.stringify({ code, reason });
  socket.end(
    `HTTP/1.1 400 Bad Request\r\nContent-Type: application/json\r\nContent-Length: ${Buffer.byteLength(body)}\r\nConnection: close\r\n\r\n${body}`,
  );
}

beforeAll(async () => {
  httpServer = createServer((_req, res) => {
    res.writeHead(404);
    res.end();
  });

  wss = new WebSocketServer({ noServer: true });

  // Mirrors the optimistic-connect architecture:
  // 1. Token verified locally (HMAC)
  // 2. Token entityType/tenantId must match request params
  // 3. Connection accepted immediately
  // 4. Entity access decided locally (no backend round-trip)
  httpServer.on('upgrade', async (req, socket, head) => {
    const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
    const token = url.searchParams.get('token');
    const entityType = url.searchParams.get('entityType');
    const tenantId = url.searchParams.get('tenantId');

    if (!token || !entityType || !tenantId) {
      rejectAtHttp(wss, req, socket, head, 4400, 'Missing params');
      return;
    }

    const payload = verifyToken(token);
    if (!payload) {
      rejectAtHttp(wss, req, socket, head, 4001, 'Invalid or expired token');
      return;
    }

    // Token must match requested entityType and tenantId
    if (payload.entityType !== entityType) {
      rejectAtHttp(wss, req, socket, head, 4003, 'Token not valid for this entity type');
      return;
    }
    if (payload.tenantId !== tenantId) {
      rejectAtHttp(wss, req, socket, head, 4003, 'Token not valid for this tenant');
      return;
    }

    const entityId = url.pathname.replace(/^\/+/, '') || undefined;
    if (!entityId) {
      rejectAtHttp(wss, req, socket, head, 4400, 'Missing entityId');
      return;
    }

    if (socket.destroyed) return;

    // Accept the connection immediately (optimistic)
    wss.handleUpgrade(req, socket, head, async (ws) => {
      wss.emit('connection', ws);

      // Async local entity authorization — close connection on failure
      try {
        const allowed = await mockVerify({ entityType, entityId, tenantId, userId: payload.userId });
        if (!allowed) {
          ws.close(4003, 'Access denied');
        }
        // On success: connection stays open, writes would be unblocked
      } catch (err) {
        if (err instanceof MissingScopeError) {
          ws.close(4400, 'Missing entity scope');
        } else {
          ws.close(4503, 'Authorization unavailable');
        }
      }
    });
  });

  await new Promise<void>((resolve) => {
    httpServer.listen(0, '127.0.0.1', () => {
      const addr = httpServer.address();
      port = typeof addr === 'object' && addr ? addr.port : 0;
      baseUrl = `ws://127.0.0.1:${port}`;
      resolve();
    });
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

afterAll(async () => {
  for (const client of wss.clients) client.close(1001);
  wss.close();
  httpServer.close();
});

/** Connect and wait for either a stable open connection, a close event, or an error. */
function connectWs(path: string): Promise<{ ws: WsWebSocket; closeCode?: number; closeReason?: string; error?: Error }> {
  return new Promise((resolve, reject) => {
    const ws = new WsWebSocket(`${baseUrl}${path}`);
    const timeout = setTimeout(() => reject(new Error('Connection timeout')), 5000);

    ws.on('open', () => {
      // Give the server a chance to run async verification and potentially close
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

    ws.on('error', (err) => {
      clearTimeout(timeout);
      // HTTP-level rejections (no WS upgrade) trigger error events
      resolve({ ws, error: err });
    });
  });
}

describe('WebSocket upgrade rejection (pre-upgrade)', () => {
  it('1.2.1 missing token param → HTTP reject', async () => {
    const { error } = await connectWs('/entity-1?entityType=task&tenantId=tenant-1');
    expect(error).toBeDefined();
  });

  it('1.2.2 missing entityType param → HTTP reject', async () => {
    const token = createSignedToken('user-1');
    const { error } = await connectWs(`/entity-1?token=${token}&tenantId=tenant-1`);
    expect(error).toBeDefined();
  });

  it('1.2.3 missing tenantId param → HTTP reject', async () => {
    const token = createSignedToken('user-1');
    const { error } = await connectWs(`/entity-1?token=${token}&entityType=task`);
    expect(error).toBeDefined();
  });

  it('1.2.4 missing entityId (no path) → HTTP reject', async () => {
    const token = createSignedToken('user-1');
    const { error } = await connectWs(`/?token=${token}&entityType=task&tenantId=tenant-1`);
    expect(error).toBeDefined();
  });

  it('1.2.5 invalid token → HTTP reject', async () => {
    const { error } = await connectWs('/entity-1?token=garbage&entityType=task&tenantId=tenant-1');
    expect(error).toBeDefined();
  });

  it('1.2.6 expired token → HTTP reject', async () => {
    const token = createExpiredToken('user-1');
    const { error } = await connectWs(`/entity-1?token=${token}&entityType=task&tenantId=tenant-1`);
    expect(error).toBeDefined();
  });

  it('1.2.7 token entityType mismatch → HTTP reject', async () => {
    const token = createSignedToken({ userId: 'user-1', entityType: 'page', tenantId: 'tenant-1' });
    const { error } = await connectWs(`/entity-1?token=${token}&entityType=task&tenantId=tenant-1`);
    expect(error).toBeDefined();
  });

  it('1.2.8 token tenantId mismatch → HTTP reject', async () => {
    const token = createSignedToken({ userId: 'user-1', entityType: 'task', tenantId: 'tenant-other' });
    const { error } = await connectWs(`/entity-1?token=${token}&entityType=task&tenantId=tenant-1`);
    expect(error).toBeDefined();
  });
});

describe('Async entity verification (post-upgrade)', () => {
  it('1.3.1 local check returns denied → close 4003', async () => {
    mockVerify.mockResolvedValueOnce(false);
    const token = createSignedToken('user-1');
    const { closeCode } = await connectWs(`/entity-1?token=${token}&entityType=task&tenantId=tenant-1`);
    expect(closeCode).toBe(4003);
  });

  it('1.3.2 local check throws (DB/resolver error) → close 4503', async () => {
    mockVerify.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    const token = createSignedToken('user-1');
    const { closeCode } = await connectWs(`/entity-1?token=${token}&entityType=task&tenantId=tenant-1`);
    expect(closeCode).toBe(4503);
  });

  it('1.3.3 local check allowed → connection stays open', async () => {
    mockVerify.mockResolvedValueOnce(true);
    const token = createSignedToken('user-1');
    const { ws, closeCode } = await connectWs(`/entity-1?token=${token}&entityType=task&tenantId=tenant-1`);
    expect(closeCode).toBeUndefined();
    expect(ws.readyState).toBe(WsWebSocket.OPEN);
    ws.close();
  });

  it('1.3.4 local check throws MissingScopeError → close 4400', async () => {
    mockVerify.mockRejectedValueOnce(new MissingScopeError('attachment', 'organization', 'organizationId'));
    const token = createSignedToken('user-1');
    const { closeCode } = await connectWs(`/entity-1?token=${token}&entityType=task&tenantId=tenant-1`);
    expect(closeCode).toBe(4400);
  });
});
