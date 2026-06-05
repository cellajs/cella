import { appConfig } from 'shared';
import process from 'node:process';
import { setupGracefulShutdown } from 'shared/worker-lifecycle';
import { waitForBackend } from 'shared/wait-for-backend';
import { BACKEND_POLL_INTERVAL_MS, BACKEND_POLL_TIMEOUT_MS } from './constants';
import { env } from './env';
import { logEvent } from './lib/pino';
import { otel } from './lib/tracing';
import { startWsServer, closeWsServer } from './server/ws-server';

export async function startYjsWorker(): Promise<void> {
  // Stop if yjs is disabled via config
  if (!appConfig.has.yjs) {
    logEvent('info', 'Yjs server disabled by appConfig');
    return;
  }

  // Start the WebSocket server first so the container platform can see
  // the port is open. waitForBackend runs after the server is listening.
  startWsServer();

  // Start OTel SDK
  otel.start();
  otel.verifyConnection();

  setupGracefulShutdown({
    name: 'yjs',
    cleanup: async () => {
      await closeWsServer();
      await otel.shutdown();
    },
    log: (msg) => logEvent('info', msg),
  });

  if (env.NODE_ENV === 'development') {
    // Wait for backend, but don't crash if it times out — the server
    // is already listening and can handle requests once backend is up.
    waitForBackend(BACKEND_POLL_INTERVAL_MS, BACKEND_POLL_TIMEOUT_MS).catch((err) => {
      logEvent('warn', `waitForBackend failed: ${err.message}. Yjs will retry per-request.`);
    });
  }
}

void startYjsWorker().catch((error) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`[yjs] failed to start: ${message}\n`);
  process.exitCode = 1;
});
