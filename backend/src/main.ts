import process from 'node:process';
import { env } from '#/env';
import type { ProcessService } from '#/env-service-secrets';

// One entry per service. MCP, OAuth and jobs skip API initialization and wait for the migrate companion's migrations.
const entries: Record<ProcessService, () => Promise<unknown>> = {
  api: () => import('#/main.api'),
  migrate: () => import('#/main.migrate'),
  mcp: () => import('#/modules/mcp/worker/mcp-worker-entry').then((m) => m.startMcpWorker()),
  oauth: () => import('#/modules/oauth-server/worker/oauth-worker-entry').then((m) => m.startOauthWorker()),
  jobs: () => import('#/lib/jobs-worker').then((m) => m.startJobsWorker()),
};

await entries[env.SERVICE]().catch((error: unknown) => {
  // Exit only once the line had time to flush.
  process.stderr.write(`[${env.SERVICE}] Failed to start: ${error instanceof Error ? error.stack : error}\n`);
  setTimeout(() => process.exit(1), 500);
});
