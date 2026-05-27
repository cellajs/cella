import { createServer, type Server } from 'node:http';
import { WebSocketServer } from 'ws';
import { env } from '../env';
import { logEvent } from '../lib/pino';
import { closeDb } from '../data/db';
import { handleHttpRequest } from './health';
import { setupUpgradeHandler, setupConnectionHandler } from './upgrade';

let httpServer: Server | null = null;
let wss: WebSocketServer | null = null;

export function startWsServer(): void {
  httpServer = createServer(handleHttpRequest);

  const server = new WebSocketServer({ noServer: true, maxPayload: 2 * 1024 * 1024 });
  wss = server;

  httpServer.on('upgrade', setupUpgradeHandler(server));
  setupConnectionHandler(server);

  httpServer.listen(env.YJS_PORT, () => {
    logEvent('info', 'Yjs WebSocket server listening', { port: env.YJS_PORT });
  });
}

export async function closeWsServer(): Promise<void> {
  logEvent('info', 'Yjs worker stopping...');

  if (wss) {
    for (const client of wss.clients) {
      client.close(1001, 'Server shutting down');
    }
    wss.close();
    wss = null;
  }

  if (httpServer) {
    httpServer.close();
    httpServer = null;
  }

  await closeDb();

  logEvent('info', 'Yjs worker stopped');
}

/** 
 * Number of raw WebSocket connections to the server.
 */
export function getConnectionCount(): number {
  return wss?.clients.size ?? 0;
}
