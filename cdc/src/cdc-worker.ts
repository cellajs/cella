import process from 'node:process';
import { runCdcWorker } from './index';
import { log } from './lib/pino';

/**
 * Starts the CDC worker, which subscribes to PostgreSQL logical replication,
 * creates activities from database changes, and pushes notifications to the
 * API over WebSocket. The bootable `runCdcWorker()` lives in `index.ts`,
 * reused by the backend `MODE=cdc` shim.
 */
runCdcWorker().catch((error) => {
  log.error('Failed to start CDC worker', { err: error });
  process.exit(1);
});
