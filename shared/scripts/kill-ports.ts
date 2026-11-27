import { appConfig } from '../src/config-builder/app-config.ts';
import { checkMark } from '../src/utils/console.ts';
import { portListeners } from '../src/utils/port-listeners.ts';
import { drizzleStudioPort, frontendDevPort, storybookPort } from '../src/utils/tool-ports.ts';

/**
 * Ends every listener on this checkout's dev ports: the services, Vite, Storybook and Drizzle Studio. The database
 * container stays, and a stack on other ports, another checkout's or the developer's, keeps running.
 */
const ports = new Set([
  ...Object.values(appConfig.services).flatMap((service) => ('internalPort' in service ? [service.port, service.internalPort] : [service.port])),
  frontendDevPort(),
  storybookPort(),
  drizzleStudioPort(),
]);

let freed = 0;
for (const port of ports) {
  const pids = portListeners(port);
  if (pids.length === 0) continue;
  for (const pid of pids) process.kill(pid);
  console.info(`${checkMark} Port ${port} freed (pid ${pids.join(', ')})`);
  freed += 1;
}
if (freed === 0) console.info(`${checkMark} Nothing listens on this checkout's dev ports`);
