import type { Server } from 'node:http';
import process from 'node:process';
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { createHealthApp } from 'shared/health-app';
import { getEventLoopLagMs } from 'shared/utils/event-loop-monitor';
import { WebSocketServer } from 'ws';
import { YJS_MAX_UPDATE_BYTES } from '#/modules/yjs/helpers/yjs-log';
import { closeDb } from '../data/db';
import { logListenerStatus, stopLogListener } from '../data/listener';
import { logNotifier } from '../data/log-notifier';
import { env } from '../env';
import { log } from '../lib/pino';
import { getActiveClientCount, getActiveDocumentCount } from '../sync/session-manager';
import { setupConnectionHandler, setupUpgradeHandler } from './upgrade';

let httpServer: Server | null = null;
let wss: WebSocketServer | null = null;

/** The shared health app, mounted on both the bare path and the `/yjs` prefix, since the load balancer forwards `/yjs/...` without stripping it. */
export function buildHttpApp(): Hono {
  // biome-ignore lint/style/noProcessEnv: RELEASE_SHA is baked into the image by Docker, not part of the validated env schema
  const version = process.env.RELEASE_SHA ?? 'unknown';
  const healthApp = createHealthApp({
    version,
    full: () => {
      const eventLoopLagMs = getEventLoopLagMs();
      // A listener that is down leaves outside writes to the live stamp, up to a minute late: degraded, not down.
      const listener = logListenerStatus();
      const lagging = eventLoopLagMs >= 1000 ? 'unhealthy' : eventLoopLagMs >= 100 ? 'degraded' : 'healthy';
      const status = lagging === 'healthy' && listener === 'connecting' ? 'degraded' : lagging;
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
          listener,
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
  // hostname doubles as the Host fallback for the load balancer's host-less HTTP/1.0 probe, which @hono/node-server otherwise rejects with 400.
  const server = serve({ fetch: buildHttpApp().fetch, hostname: '0.0.0.0', port: env.YJS_PORT }, () => {
    log.info('Yjs WebSocket server listening', { port: env.YJS_PORT });
  }) as Server;
  httpServer = server;

  const wsServer = new WebSocketServer({ noServer: true, maxPayload: YJS_MAX_UPDATE_BYTES });
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

  await stopLogListener();
  // Rows appended before the sockets closed still reach the other relays.
  await logNotifier.flush();
  await closeDb();

  log.info('Yjs worker stopped');
}

export function getConnectionCount(): number {
  return wss?.clients.size ?? 0;
}
