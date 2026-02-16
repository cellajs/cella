import { stopHealthServer, startHealthServer } from './health';
import { logEvent } from './pino';
import { startCdcWorker, stopCdcWorker } from './worker';

/**
 * CDC Worker Entry Point
 *
 * This script starts the Change Data Capture worker that subscribes to
 * PostgreSQL logical replication and creates activities from database changes.
 * It also sends activity notifications to the API server via WebSocket.
 *
 * Only runs when DEV_MODE=full (production always runs CDC).
 * In basic/core modes, CDC is disabled for simpler local development.
 */

// Check if CDC should run (only in full mode or production)
const devMode = process.env.DEV_MODE || 'core';
if (devMode !== 'full' && process.env.NODE_ENV !== 'production') {
  process.exit(0);
}

// Handle graceful shutdown
async function gracefulShutdown(signal: string): Promise<void> {
  logEvent('info', `Received ${signal}, shutting down CDC worker...`);
  await stopCdcWorker();
  await stopHealthServer();
  process.exit(0);
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

// Start health server for monitoring
startHealthServer();

// Start the worker
startCdcWorker().catch((error) => {
  logEvent('error', 'Failed to start CDC worker', { error });
  process.exit(1);
});
