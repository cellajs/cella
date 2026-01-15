import { startCdcWorker } from './worker';

/**
 * CDC Worker Entry Point
 *
 * This script starts the Change Data Capture worker that subscribes to
 * PostgreSQL logical replication and creates activities from database changes.
 *
 * Set CDC_DISABLED=true to skip starting the worker (useful for tests).
 */

// Check if CDC is disabled
if (process.env.CDC_DISABLED === 'true') {
  console.log('CDC worker disabled via CDC_DISABLED=true');
  process.exit(0);
}

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
