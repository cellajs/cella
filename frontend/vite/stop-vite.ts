import { checkMark } from 'shared/utils/console';
import { portListeners } from 'shared/utils/port-listeners';
import { frontendDevPort } from 'shared/utils/tool-ports';

// The port this checkout's dev server listens on (vite.config.ts): another checkout's Vite keeps running.
const port = frontendDevPort();

const pids = portListeners(port);
for (const pid of pids) process.kill(pid);
if (pids.length) {
  console.info(' ');
  console.info(`${checkMark} Vite stopped (port ${port})`);
  console.info(' ');
}
