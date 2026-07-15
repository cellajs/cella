import process from 'node:process';
import { startYjsWorker } from './index';

void startYjsWorker().catch((error) => {
  const message = error instanceof Error ? (error.stack ?? error.message) : String(error);
  process.stderr.write(`[yjs] failed to start: ${message}\n`);
  process.exitCode = 1;
});
