import { env } from './env';

// Load exactly one runtime entry. Workers skip API initialization and wait for the API to complete migrations.
if (env.MODE === 'migrate') {
  await import('./main.migrate');
} else if (env.MODE === 'mcp') {
  await import('./main.mcp');
} else if (env.MODE === 'oauth') {
  await import('./main.oauth');
} else if (env.MODE === 'cdc') {
  await import('./main.cdc');
} else if (env.MODE === 'jobs') {
  await import('./main.jobs');
} else {
  await import('./main.api');
}
