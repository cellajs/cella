import { env } from './env';

// Branch early on MODE:
//  - migrate:    one-shot migration and role setup.
//  - mcp-worker: skips all API initialization (waits for the API to migrate).
//  - cdc:        logical-replication worker only (waits for the API to migrate).
//  - api:        the full HTTP server.
if (env.MODE === 'migrate') {
  await import('./main.migrate');
} else if (env.MODE === 'mcp-worker') {
  await import('./main.mcp-worker');
} else if (env.MODE === 'cdc') {
  await import('./main.cdc');
} else {
  await import('./main.api');
}
