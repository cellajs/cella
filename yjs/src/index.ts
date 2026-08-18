import { appConfig } from 'shared';
import { waitForBackend } from 'shared/utils/wait-for-backend';
import { setupGracefulShutdown } from 'shared/utils/worker-lifecycle';
import { env } from './env';
import { log } from './lib/pino';
import { otel } from './lib/tracing';
import { closeWsServer, startWsServer } from './server/ws-server';
import { runStartupSweep } from './sync/sweep';

export { closeWsServer };

/** Entrypoint for both the `yjs` package (split deploy) and the backend single-VM boot. */
export async function startYjsWorker(): Promise<void> {
  if (appConfig.services.yjs.enabled === false) {
    log.info('Yjs server disabled by appConfig');
    return;
  }

  // Starts first so the container platform sees an open port before waitForBackend runs.
  startWsServer();

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
    // A timeout here must not crash the process: the server already listens and serves once the backend is up.
    waitForBackend()
      .then(() => runStartupSweep())
      .catch((err) => {
        log.warn('waitForBackend failed. Yjs will retry per-request.', { err });
      });
  } else {
    // Persist and clean up sessions orphaned by a relay crash.
    runStartupSweep().catch((err) => log.warn('Startup sweep failed', { err }));
  }
}
