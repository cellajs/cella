import { type ServerType, serve } from '@hono/node-server';
import { createHealthApp } from 'shared/health-app';
import { waitForBackend } from 'shared/utils/wait-for-backend';
import { setupGracefulShutdown } from 'shared/utils/worker-lifecycle';
import { env } from './env';
import { log } from './lib/pino';
import { otel } from './lib/tracing';
import { getHealthResponse } from './network/health';
import { startCdcWorker, stopCdcWorker } from './pipeline/worker';

let healthServer: ServerType | null = null;

/**
 * Entrypoint of the worker: as its own process (`cdc-worker.ts`), and inside the API process under `singleVM`, with
 * `inProcess`. In-process it waits for no API, starts no telemetry and registers no shutdown handler: the API's own
 * cleanup calls `shutdownCdcWorker`. Resolves once the worker has stopped.
 */
export async function runCdcWorker(options: { inProcess?: boolean } = {}): Promise<void> {
  if (!options.inProcess) {
    if (env.NODE_ENV === 'development') await waitForBackend();
    otel.start();
    otel.verifyConnection();
  }

  const version = env.RELEASE_SHA;
  const healthApp = createHealthApp({
    version,
    full: () => {
      const { response, httpStatus } = getHealthResponse();
      return { httpStatus, body: { ...response, version } };
    },
  });

  // hostname doubles as the Host fallback for the load balancer's host-less HTTP/1.0 health probe,
  // which @hono/node-server otherwise rejects with 400 Missing host header.
  healthServer = serve({ fetch: healthApp.fetch, hostname: '0.0.0.0', port: env.CDC_HEALTH_PORT }, () => {
    log.info(`CDC health server listening on port ${env.CDC_HEALTH_PORT}`);
  });

  if (!options.inProcess) {
    setupGracefulShutdown({
      name: 'cdc',
      cleanup: async () => {
        await shutdownCdcWorker();
        await otel.shutdown();
      },
      log: (msg) => log.info(msg),
    });
  }

  await startCdcWorker();
}

/** Closes the health server and stops the worker: its own process's shutdown, and the API's cleanup under `singleVM`. */
export async function shutdownCdcWorker(): Promise<void> {
  healthServer?.close();
  await stopCdcWorker();
}
