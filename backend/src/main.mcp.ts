import process from 'node:process';
import { startMcpWorker } from '#/modules/mcp/worker/mcp-worker-entry';

startMcpWorker().catch((e) => {
  process.stderr.write(`[mcp-worker] Failed to start: ${e instanceof Error ? e.stack : e}\n`);
  setTimeout(() => process.exit(1), 500);
});
