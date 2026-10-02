import { execSync } from 'node:child_process';
import { appConfig } from 'shared';
import { checkMark } from '#/utils/console';

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

  execSync('docker compose down', { stdio: 'inherit' });
};

stopDatabase();
