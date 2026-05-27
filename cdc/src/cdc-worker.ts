import { createServer } from 'node:http';
import { setupGracefulShutdown } from 'shared/worker-lifecycle';
import { waitForBackend } from 'shared/wait-for-backend';
import { env } from './env';
import { getHealthResponse } from './network/health';
import { logEvent } from './lib/pino';
import { otel } from './lib/tracing';
import { startCdcWorker, stopCdcWorker } from './pipeline/worker';

/**
 * CDC Worker Entry Point
 *
 * This script starts the Change Data Capture worker that subscribes to
 * PostgreSQL logical replication and creates activities from database changes.
 * It also sends activity notifications to the API server via WebSocket.
 *
 * Only runs when DEV_MODE=full (production always runs CDC).
 * In core mode, CDC is disabled for simpler local development.
 */

// Check if CDC should run (only in full mode or production)
if (env.DEV_MODE !== 'full' && env.NODE_ENV !== 'production') {
  process.exit(0);
}

// Wait for backend in development before starting
const BACKEND_POLL_INTERVAL_MS = 2000;
const BACKEND_POLL_TIMEOUT_MS = 60_000;

if (env.NODE_ENV === 'development') {
  await waitForBackend(BACKEND_POLL_INTERVAL_MS, BACKEND_POLL_TIMEOUT_MS);
}

// Start OTel SDK
otel.start();
otel.verifyConnection();

// Handle graceful shutdown
setupGracefulShutdown({
  name: 'cdc',
  cleanup: async () => {
    healthServer.close();
    await stopCdcWorker();
    await otel.shutdown();
  },
  log: (msg) => logEvent('info', msg),
});

// Start health server
const healthServer = createServer((req, res) => {
  if (req.url?.startsWith('/health')) {
    const url = new URL(req.url, `http://localhost:${env.CDC_HEALTH_PORT}`);
    if (url.searchParams.get('depth') === 'full') {
      const { response, httpStatus } = getHealthResponse();
      res.writeHead(httpStatus, { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=5' });
      res.end(JSON.stringify(response));
      return;
    }
    res.writeHead(204, { 'Cache-Control': 'public, max-age=5' });
    res.end();
    return;
  }
  res.writeHead(404);
  res.end();
});
healthServer.listen(env.CDC_HEALTH_PORT, () => {
  logEvent('info', `CDC health server listening on port ${env.CDC_HEALTH_PORT}`);
});

// Start the worker
startCdcWorker().catch((error) => {
  logEvent('error', 'Failed to start CDC worker', { error });
  process.exit(1);
});
