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

export { closeWsServer };

/** Entrypoint for both the `yjs` package (split deploy) and the backend single-VM boot. */
export async function startYjsWorker(): Promise<void> {
  if (appConfig.services.yjs.enabled === false) {
    log.info('Yjs server disabled by appConfig');
    return;
  }

  // Starts first so the container platform sees an open port before waitForBackend runs.
  startWsServer();
  // Outside writes and other relays' appends reach live sessions through the log channel; without a database, none come.
  if (!env.NODB) startLogListener(onLogNotice, relayUnseenEverywhere);

  otel.start();
  otel.verifyConnection();

  // The logs no session holds, which a relay crash left or clients posted over HTTP, are written at boot and every
  // YJS_CLEANUP_DELAY_MS after; without a database, there are none.
  const stopSweep = env.NODB ? undefined : startPeriodicSweep();

  setupGracefulShutdown({
    name: 'yjs',
    cleanup: async () => {
      stopSweep?.();
      await closeWsServer();
      await otel.shutdown();
    },
    log: (msg) => log.info(msg),
  });

  if (env.NODE_ENV === 'development') {
    // A timeout here must not crash the process: the server already listens and serves once the backend is up.
    waitForBackend()
      .then(() => runSweep())
      .catch((err) => {
        log.warn('waitForBackend failed. Yjs will retry per-request.', { err });
      });
  } else {
    runSweep().catch((err) => log.warn('Startup sweep failed', { err }));
  }
}
