import { startCdcWorker } from './worker';

/**
 * CDC Worker Entry Point
 *
 * This script starts the Change Data Capture worker that subscribes to
 * PostgreSQL logical replication and creates activities from database changes.
 *
 * Only runs when DEV_MODE=full (production always runs CDC).
 * In basic/core modes, CDC is disabled for simpler local development.
 */

// Check if CDC should run (only in full mode or production)
const devMode = process.env.DEV_MODE || 'core';
if (devMode !== 'full' && process.env.NODE_ENV !== 'production') {
  console.info(`CDC worker disabled (DEV_MODE=${devMode})`);
  process.exit(0);
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.info('\nReceived SIGINT, shutting down CDC worker...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.info('\nReceived SIGTERM, shutting down CDC worker...');
  process.exit(0);
});

// Start the worker
startCdcWorker().catch((error) => {
  console.error('Failed to start CDC worker:', error);
  process.exit(1);
});
