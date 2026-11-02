import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { composeEnv } from 'shared/local-database';

// `docker compose` on backend/compose.yaml, with the project name and the database ports the app config gives.
const result = spawnSync('docker', ['compose', ...process.argv.slice(2)], {
  cwd: fileURLToPath(new URL('..', import.meta.url)),
  env: { ...process.env, ...composeEnv() },
  stdio: 'inherit',
});
process.exit(result.status ?? 1);
