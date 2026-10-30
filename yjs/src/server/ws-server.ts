import process from 'node:process';
import { type ServerType, serve } from '@hono/node-server';
import { Hono } from 'hono';
import { createHealthApp } from 'shared/health-app';
import { getEventLoopLagMs } from 'shared/utils/event-loop-monitor';
import { listenHost } from 'shared/utils/listen-host';
import { WebSocketServer } from 'ws';
import { gradeEventLoop } from '#/lib/health-helpers';
import { yjsMaxUpdateBytes } from '#/modules/yjs/helpers/yjs-log';
import { closeDb } from '../data/db';
import { logListenerStatus, stopLogListener } from '../data/listener';
import { logNotifier } from '../data/log-notifier';
import { env } from '../env';
import { log } from '../lib/pino';
import { getActiveClientCount, getActiveDocumentCount } from '../sync/session-manager';
import { setupConnectionHandler, setupUpgradeHandler } from './upgrade';

let httpServer: ServerType | null = null;
let wss: WebSocketServer | null = null;

/** The shared health app, on the bare path and under `/yjs`: the two paths `stripYjsPrefix` accepts. */
export function buildHttpApp(): Hono {
  const version = env.RELEASE_SHA;
  const healthApp = createHealthApp({
    version,
    full: () => {
      const eventLoopLagMs = getEventLoopLagMs();
      // A listener that is down leaves outside writes to the live stamp, up to a minute late: degraded, not down.
      const listener = logListenerStatus();
      const lagging = gradeEventLoop(eventLoopLagMs);
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

/** Listens on YJS_PORT: the health app over HTTP, and editor sockets through the upgrade and connection handlers. */
export function startWsServer(): void {
  const server = serve({ fetch: buildHttpApp().fetch, hostname: listenHost(), port: env.YJS_PORT }, () => {
    log.info('Yjs WebSocket server listening', { port: env.YJS_PORT });
  });
  httpServer = server;

  const wsServer = new WebSocketServer({ noServer: true, maxPayload: yjsMaxUpdateBytes });
  wss = wsServer;

  server.on('upgrade', setupUpgradeHandler(wsServer));
  setupConnectionHandler(wsServer);
}

/**
 * Closes every socket with 1001 and stops listening, then ends the log listener, flushes the notifier and ends the
 * pool, in that order.
 */
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

/** Open editor sockets on this relay, for health and metrics. */
export function getConnectionCount(): number {
  return wss?.clients.size ?? 0;
}
