import process from 'node:process';
import { runCdcWorker } from './index';

void runCdcWorker().catch((error) => {
  // Write directly to stderr: the crash may be the logger's own init failing.
  const message = error instanceof Error ? (error.stack ?? error.message) : String(error);
  process.stderr.write(`[cdc] failed to start: ${message}\n`);
  process.exitCode = 1;
});
