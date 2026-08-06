import type { Server } from 'node:http';
import process from 'node:process';
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { createHealthApp } from 'shared/health-app';
import { getEventLoopLagMs } from 'shared/utils/event-loop-monitor';
import { WebSocketServer } from 'ws';
import { closeDb } from '../data/db';
import { env } from '../env';
import { log } from '../lib/pino';
import { getActiveClientCount, getActiveDocumentCount } from '../sync/session-manager';
import { setupConnectionHandler, setupUpgradeHandler } from './upgrade';

let httpServer: Server | null = null;
let wss: WebSocketServer | null = null;

/**
 * HTTP side of the relay: the shared health app, mounted on both the bare path and
 * the `/yjs` prefix (same-origin migration: the LB forwards `/yjs/...` without
 * stripping; the WS upgrade path keeps its own prefix handling).
 */
function buildHttpApp(): Hono {
  // biome-ignore lint/style/noProcessEnv: RELEASE_SHA is baked into the image by Docker, not part of the validated env schema
  const version = process.env.RELEASE_SHA ?? 'unknown';
  const healthApp = createHealthApp({
    version,
    full: () => {
      const eventLoopLagMs = getEventLoopLagMs();
      const status = eventLoopLagMs >= 1000 ? 'unhealthy' : eventLoopLagMs >= 100 ? 'degraded' : 'healthy';
      return {
        httpStatus: 200,
        body: {
          status,
          version,
          uptime: Math.floor(process.uptime()),
          connections: getConnectionCount(),
          documents: getActiveDocumentCount(),
          clients: getActiveClientCount(),
          eventLoopLagMs,
        },
      };
    },
  });

  const app = new Hono();
  app.route('/', healthApp);
  app.route('/yjs', healthApp);
  return app;
}

export function startWsServer(): void {
  // serve() uses node:http's createServer by default, so the upgrade event is available.
  const server = serve({ fetch: buildHttpApp().fetch, port: env.YJS_PORT }, () => {
    log.info('Yjs WebSocket server listening', { port: env.YJS_PORT });
  }) as Server;
  httpServer = server;

  const wsServer = new WebSocketServer({ noServer: true, maxPayload: 2 * 1024 * 1024 });
  wss = wsServer;

  server.on('upgrade', setupUpgradeHandler(wsServer));
  setupConnectionHandler(wsServer);
}

export async function closeWsServer(): Promise<void> {
  log.info('Yjs worker stopping...');

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

  log.info('Yjs worker stopped');
}

/**
 * Number of raw WebSocket connections to the server.
 */
export function getConnectionCount(): number {
  return wss?.clients.size ?? 0;
}
