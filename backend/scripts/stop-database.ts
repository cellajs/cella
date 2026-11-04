import { execSync } from 'node:child_process';
import { appConfig } from 'shared';
import { composeEnv } from 'shared/local-database';
import { drizzleStudioPort } from 'shared/utils/tool-ports';
import { checkMark } from '#/utils/console';

/** Ends Drizzle Studio on this checkout's port, if it runs. */
const stopDrizzleStudio = () => {
  const pids = execSync(`lsof -ti:${drizzleStudioPort()} || true`, { encoding: 'utf8' }).trim();
  if (!pids) return;
  execSync(`kill ${pids.split('\n').join(' ')}`);
  console.info(`${checkMark} Drizzle Studio stopped`);
};

/**
 * Stop the database container, from the main checkout only. A checkout on shifted dev ports
 * shares the container with the main checkout, whose stack would lose its database.
 */
const stopDatabase = () => {
  if (appConfig.devPortOffset) {
    console.info(' ');
    console.info(`${checkMark} Database left running: the main checkout shares it`);
    console.info(' ');
    return;
  }

  execSync('docker compose down', { stdio: 'inherit', env: { ...process.env, ...composeEnv() } });
};

stopDrizzleStudio();
stopDatabase();
