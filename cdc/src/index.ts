import { startCdcWorker } from './worker';

/**
 * CDC Worker Entry Point
 *
 * This script starts the Change Data Capture worker that subscribes to
 * PostgreSQL logical replication and creates activities from database changes.
 */

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\nReceived SIGINT, shutting down CDC worker...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\nReceived SIGTERM, shutting down CDC worker...');
  process.exit(0);
});

// Start the worker
startCdcWorker().catch((error) => {
  console.error('Failed to start CDC worker:', error);
  process.exit(1);
});
