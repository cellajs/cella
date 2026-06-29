import process from 'node:process';
import { startYjsWorker } from './index';

/**
 * Yjs Worker Entry Point — boots the relay as a standalone process. See
 * `index.ts` for the bootable `startYjsWorker()`.
 */
void startYjsWorker().catch((error) => {
  const message = error instanceof Error ? (error.stack ?? error.message) : String(error);
  process.stderr.write(`[yjs] failed to start: ${message}\n`);
  process.exitCode = 1;
});
