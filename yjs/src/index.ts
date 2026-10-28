import { appConfig } from 'shared';
import { waitForBackend } from 'shared/utils/wait-for-backend';
import { setupGracefulShutdown } from 'shared/utils/worker-lifecycle';
import { startLogListener } from './data/listener';
import { env } from './env';
import { log } from './lib/pino';
import { otel } from './lib/tracing';
import { closeWsServer, startWsServer } from './server/ws-server';
import { onLogNotice, relayUnseenEverywhere } from './sync/relay';
import { runSweep, startPeriodicSweep } from './sync/sweep';

let stopSweep: (() => void) | undefined;

/**
 * Entrypoint for both the `yjs` package (split deploy) and the backend single-VM boot, with `inProcess`. In-process it
 * waits for no API, starts no telemetry and registers no shutdown handler: the API's own cleanup calls
 * `shutdownYjsWorker`.
 */
export async function startYjsWorker(options: { inProcess?: boolean } = {}): Promise<void> {
  if (appConfig.services.yjs.enabled === false) {
    log.info('Yjs server disabled by appConfig');
    return;
  }

  // Starts first so the container platform sees an open port before waitForBackend runs.
  startWsServer();
  // Outside writes and other relays' appends reach live sessions through the log channel; without a database, none come.
  if (!env.NODB) startLogListener(onLogNotice, relayUnseenEverywhere);

  if (!options.inProcess) {
    otel.start();
    otel.verifyConnection();
  }

  // The logs no session holds, which a relay crash left or clients posted over HTTP, are written at boot and every
  // yjsCleanupDelayMs after; without a database, there are none.
  stopSweep = env.NODB ? undefined : startPeriodicSweep();

  if (!options.inProcess) {
    setupGracefulShutdown({
      name: 'yjs',
      cleanup: async () => {
        await shutdownYjsWorker();
        await otel.shutdown();
      },
      log: (msg) => log.info(msg),
    });
  }

  if (env.NODB) return;
  if (env.NODE_ENV === 'development' && !options.inProcess) {
    // A timeout here must not crash the process: the server already listens and serves once the backend is up.
    waitForBackend()
      .then(() => runSweep())
      .catch((err) => {
        log.warn('Backend not ready: skipping the boot sweep, the periodic sweep follows', { err });
      });
  } else {
    runSweep().catch((err) => log.warn('Startup sweep failed', { err }));
  }
}

/**
 * Stops the periodic sweep, then closes every socket, the log listener, the notifier and the pool: its own process's
 * shutdown, and the API's cleanup under `singleVM`.
 */
export async function shutdownYjsWorker(): Promise<void> {
  stopSweep?.();
  await closeWsServer();
}
