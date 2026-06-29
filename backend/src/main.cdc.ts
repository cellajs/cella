import process from 'node:process';
import { runCdcWorker } from 'cdc';

runCdcWorker().catch((e) => {
  process.stderr.write(`[cdc] Failed to start: ${e instanceof Error ? e.stack : e}\n`);
  setTimeout(() => process.exit(1), 500);
});
