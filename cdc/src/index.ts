import { createServer } from 'node:http';
import { setupGracefulShutdown } from 'shared/worker-lifecycle';
import { waitForBackend } from 'shared/wait-for-backend';
import { env } from './env';
import { log } from './lib/pino';
import { otel } from './lib/tracing';
import { getHealthResponse } from './network/health';
import { startCdcWorker, stopCdcWorker } from './pipeline/worker';

export { startCdcWorker, stopCdcWorker };

const BACKEND_POLL_INTERVAL_MS = 2000;
const BACKEND_POLL_TIMEOUT_MS = 60_000;

/**
 * Boot the CDC worker as a standalone process: wait for the backend (dev),
 * start OTel, expose the health server, register graceful shutdown, and start
 * the replication worker. Used by both the `cdc` package entrypoint (split
 * deploy) and the backend `MODE=cdc` shim (single backend image).
 */
export async function runCdcWorker(): Promise<void> {
  // Wait for backend in development before starting
  if (env.NODE_ENV === 'development') {
    await waitForBackend(BACKEND_POLL_INTERVAL_MS, BACKEND_POLL_TIMEOUT_MS);
  }

  // Start OTel SDK
  otel.start();
  otel.verifyConnection();

  // Health server
  const healthServer = createServer((req, res) => {
    if (req.url?.startsWith('/health')) {
      const version = process.env.RELEASE_SHA ?? 'unknown';
      const url = new URL(req.url, `http://localhost:${env.CDC_HEALTH_PORT}`);
      if (url.searchParams.get('depth') === 'full') {
        const { response, httpStatus } = getHealthResponse();
        res.writeHead(httpStatus, {
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=5',
          'X-App-Version': version,
        });
        res.end(JSON.stringify({ ...response, version }));
        return;
      }
      res.writeHead(204, { 'Cache-Control': 'public, max-age=5', 'X-App-Version': version });
      res.end();
      return;
    }
    res.writeHead(404);
    res.end();
  });

  // Handle graceful shutdown
  setupGracefulShutdown({
    name: 'cdc',
    cleanup: async () => {
      healthServer.close();
      await stopCdcWorker();
      await otel.shutdown();
    },
    log: (msg) => log.info(msg),
  });

  healthServer.listen(env.CDC_HEALTH_PORT, () => {
    log.info(`CDC health server listening on port ${env.CDC_HEALTH_PORT}`);
  });

  await startCdcWorker();
}
