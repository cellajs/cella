import process from 'node:process';
import { runCdcWorker } from './index';
import { log } from './lib/pino';

runCdcWorker().catch((error) => {
  log.error('Failed to start CDC worker', { err: error });
  process.exit(1);
});
