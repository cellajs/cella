import { exec } from 'node:child_process';
import { STUDIO_PORT } from './port';
import { checkMark } from '#/utils/console';

/**
 * Stop Drizzle Studio programmatically.
 */
const stopDrizzleStudio = () => {
  exec(`lsof -ti:${STUDIO_PORT}`, (_, stdout) => {
    const pid = stdout.trim();
    if (!pid) return;
    

    exec(`kill -9 ${pid}`, (killErr) => {
      if (killErr) {
        console.error((`Failed to kill process ${pid}: ${killErr.message}`));
        process.exit(1);
      }
    });
      console.info(' ');
      console.info(`${checkMark} Drizzle Studio stopped (PID: ${pid})`);
      console.info(' ');
  });
};

stopDrizzleStudio();

