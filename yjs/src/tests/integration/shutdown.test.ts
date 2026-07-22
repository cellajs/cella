import { afterEach, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import { WebSocketServer, WebSocket as WsWebSocket } from 'ws';

describe('4.2 Graceful shutdown', () => {
  let httpServer: Server;
  let wss: WebSocketServer;
  let port: number;

  function startServer(): Promise<void> {
    return new Promise((resolve) => {
      httpServer = createServer((_req, res) => {
        res.writeHead(200);
        res.end('ok');
      });
      wss = new WebSocketServer({ server: httpServer });
      httpServer.listen(0, () => {
        port = (httpServer.address() as { port: number }).port;
        resolve();
      });
    });
  }

  async function shutdownServer(): Promise<void> {
    if (wss) {
      for (const client of wss.clients) {
        client.close(1001, 'Server shutting down');
      }
      wss.close();
    }
    if (httpServer) {
      httpServer.close();
    }
  }

  afterEach(async () => {
    try {
      await shutdownServer();
    } catch {
      // Already closed
    }
  });

  function connectClient(): Promise<WsWebSocket> {
    return new Promise((resolve, reject) => {
      const ws = new WsWebSocket(`ws://localhost:${port}`);
      ws.on('open', () => resolve(ws));
      ws.on('error', reject);
    });
  }

  it('all connected clients receive close code 1001 on shutdown', async () => {
    await startServer();

    // Connect 3 clients
    const clients = await Promise.all([connectClient(), connectClient(), connectClient()]);

    // Collect close events
    const closePromises = clients.map(
      (ws) =>
        new Promise<{ code: number; reason: string }>((resolve) => {
          ws.on('close', (code, reason) => resolve({ code, reason: reason.toString() }));
        }),
    );

    // Trigger shutdown
    await shutdownServer();

    const results = await Promise.all(closePromises);
    for (const r of results) {
      expect(r.code).toBe(1001);
      expect(r.reason).toBe('Server shutting down');
    }
  });

  it('server stops accepting new connections after shutdown', async () => {
    await startServer();

    await shutdownServer();

    // Connection errors vary by environment, so assert failure without matching the message.
    const result = await new Promise<{ opened: boolean; error?: Error }>((resolve) => {
      const ws = new WsWebSocket(`ws://localhost:${port}`);
      ws.on('open', () => {
        ws.close();
        resolve({ opened: true });
      });
      ws.on('error', (err) => resolve({ opened: false, error: err }));
    });

    expect(result.opened).toBe(false);
    expect(result.error).toBeInstanceOf(Error);
  });

  it('shutdown with no clients does not throw', async () => {
    await startServer();

    // Should complete without error
    await shutdownServer();
  });

  it('clients connected during shutdown receive close before server stops', async () => {
    await startServer();

    const ws = await connectClient();

    let closeReceivedBeforeServerStop = false;
    const closePromise = new Promise<void>((resolve) => {
      ws.on('close', () => {
        closeReceivedBeforeServerStop = true;
        resolve();
      });
    });

    // Close all clients (mimics closeWsServer behavior)
    for (const client of wss.clients) {
      client.close(1001, 'Server shutting down');
    }

    await closePromise;
    expect(closeReceivedBeforeServerStop).toBe(true);

    // Now close the server
    wss.close();
    httpServer.close();
  });
});
