import { env } from './env';

// Load exactly one runtime entry. Workers skip API initialization and wait for the API
// to complete migrations; migrate mode performs role setup and exits.
if (env.MODE === 'migrate') {
  await import('./main.migrate');
} else if (env.MODE === 'mcp') {
  await import('./main.mcp');
} else if (env.MODE === 'cdc') {
  await import('./main.cdc');
} else {
  await import('./main.api');
}
