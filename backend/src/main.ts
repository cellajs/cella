import process from 'node:process';
import { env } from '#/env';

/** Writes why a worker could not start to stderr, then exits once the line had time to flush. */
const exitOnStartFailure = (name: string) => (error: unknown) => {
  process.stderr.write(`[${name}] Failed to start: ${error instanceof Error ? error.stack : error}\n`);
  setTimeout(() => process.exit(1), 500);
};

// Load exactly one runtime entry. Workers skip API initialization and wait for the API to complete migrations.
if (env.MODE === 'migrate') {
  await import('#/main.migrate');
} else if (env.MODE === 'mcp') {
  (await import('#/modules/mcp/worker/mcp-worker-entry')).startMcpWorker().catch(exitOnStartFailure('mcp-worker'));
} else if (env.MODE === 'oauth') {
  (await import('#/modules/oauth-server/worker/oauth-worker-entry')).startOauthWorker().catch(exitOnStartFailure('oauth-worker'));
} else if (env.MODE === 'jobs') {
  (await import('#/lib/jobs-worker')).startJobsWorker().catch(exitOnStartFailure('jobs'));
} else {
  await import('#/main.api');
}
