import process from 'node:process';
import { startYjsWorker } from './index';

// Entry point: boots the relay as a standalone process (see `index.ts` for the bootable `startYjsWorker()`).
void startYjsWorker().catch((error) => {
  const message = error instanceof Error ? (error.stack ?? error.message) : String(error);
  process.stderr.write(`[yjs] failed to start: ${message}\n`);
  process.exitCode = 1;
});
