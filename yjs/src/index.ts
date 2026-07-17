import { appConfig } from 'shared';
import { setupGracefulShutdown } from 'shared/utils/worker-lifecycle';
import { waitForBackend } from 'shared/utils/wait-for-backend';
import { BACKEND_POLL_INTERVAL_MS, BACKEND_POLL_TIMEOUT_MS } from './constants';
import { env } from './env';
import { log } from './lib/pino';
import { otel } from './lib/tracing';
import { closeWsServer, startWsServer } from './server/ws-server';
import { runStartupSweep } from './sync/sweep';

export { closeWsServer };

/**
 * Boot the Yjs relay: start the WebSocket server, OTel, register graceful
 * shutdown, then (in dev) wait for the backend. Used by both the `yjs` package
 * entrypoint (split deploy) and the backend single-VM boot.
 */
export async function startYjsWorker(): Promise<void> {
  // Stop if yjs is disabled via config
  if (appConfig.services.yjs.enabled === false) {
    log.info('Yjs server disabled by appConfig');
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
    log: (msg) => log.info(msg),
  });

  if (env.NODE_ENV === 'development') {
    // Wait for backend, but don't crash if it times out: the server
    // is already listening and can handle requests once backend is up.
    // Sweep crash-orphaned session rows once the backend is reachable.
    waitForBackend(BACKEND_POLL_INTERVAL_MS, BACKEND_POLL_TIMEOUT_MS)
      .then(() => runStartupSweep())
      .catch((err) => {
        log.warn('waitForBackend failed. Yjs will retry per-request.', { err });
      });
  } else {
    // Persist and clean up sessions orphaned by a relay crash.
    runStartupSweep().catch((err) => log.warn('Startup sweep failed', { err }));
  }
}
