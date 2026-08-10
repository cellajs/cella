import process from 'node:process';
import { serve } from '@hono/node-server';
import { createHealthApp } from 'shared/health-app';
import { waitForBackend } from 'shared/utils/wait-for-backend';
import { setupGracefulShutdown } from 'shared/utils/worker-lifecycle';
import { env } from './env';
import { log } from './lib/pino';
import { otel } from './lib/tracing';
import { getHealthResponse } from './network/health';
import { startCdcWorker, stopCdcWorker } from './pipeline/worker';

export { startCdcWorker, stopCdcWorker };

/**
 * Boot the CDC worker as a standalone process: wait for the backend (dev),
 * start OTel, expose the health server, register graceful shutdown, and start
 * the replication worker. Used by both the `cdc` package entrypoint (split
 * deploy) and the backend `MODE=cdc` shim (single backend image).
 */
export async function runCdcWorker(): Promise<void> {
  if (env.NODE_ENV === 'development') {
    await waitForBackend();
  }

  otel.start();
  otel.verifyConnection();

  // biome-ignore lint/style/noProcessEnv: RELEASE_SHA is baked into the image by Docker, not part of the validated env schema
  const version = process.env.RELEASE_SHA ?? 'unknown';
  const healthApp = createHealthApp({
    version,
    full: () => {
      const { response, httpStatus } = getHealthResponse();
      return { httpStatus, body: { ...response, version } };
    },
  });

  // hostname doubles as the Host fallback for the LB's host-less HTTP/1.0 health
  // probe: without it @hono/node-server rejects the probe with 400 Missing host header.
  const healthServer = serve({ fetch: healthApp.fetch, hostname: '0.0.0.0', port: env.CDC_HEALTH_PORT }, () => {
    log.info(`CDC health server listening on port ${env.CDC_HEALTH_PORT}`);
  });

  setupGracefulShutdown({
    name: 'cdc',
    cleanup: async () => {
      healthServer.close();
      await stopCdcWorker();
      await otel.shutdown();
    },
    log: (msg) => log.info(msg),
  });

  await startCdcWorker();
}
