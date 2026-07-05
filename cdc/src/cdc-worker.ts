import process from 'node:process';
import { runCdcWorker } from './index';
import { log } from './lib/pino';

/**
 * CDC Worker Entry Point
 *
 * Starts the Change Data Capture worker that subscribes to PostgreSQL logical
 * replication, creates activities from database changes, and pushes activity
 * notifications to the API over WebSocket. See `index.ts` for the bootable
 * `runCdcWorker()` (also reused by the backend `MODE=cdc` shim).
 */
runCdcWorker().catch((error) => {
  log.error('Failed to start CDC worker', { err: error });
  process.exit(1);
});
