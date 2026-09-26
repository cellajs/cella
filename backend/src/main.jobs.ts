import process from 'node:process';
import { startJobsWorker } from '#/lib/jobs-worker';

startJobsWorker().catch((e) => {
  process.stderr.write(`[jobs] Failed to start: ${e instanceof Error ? e.stack : e}\n`);
  setTimeout(() => process.exit(1), 500);
});
