import process from 'node:process';
import { startAiWorker } from '#/modules/ai/worker/ai-worker-entry';

startAiWorker().catch((e) => {
  process.stderr.write(`[ai-worker] Failed to start: ${e instanceof Error ? e.stack : e}\n`);
  setTimeout(() => process.exit(1), 500);
});
