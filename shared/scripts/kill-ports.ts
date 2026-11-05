import { execSync } from 'node:child_process';
import os from 'node:os';
import { appConfig } from '../src/config-builder/app-config.ts';
import { checkMark } from '../src/utils/console.ts';
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

const listeners = (port: number): number[] => {
  const command =
    os.platform() === 'win32'
      ? `powershell -Command "(Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue).OwningProcess"`
      : `lsof -tiTCP:${port} -sTCP:LISTEN || true`;
  return execSync(command, { encoding: 'utf8' }).split(/\s+/).filter(Boolean).map(Number);
};

let freed = 0;
for (const port of ports) {
  const pids = listeners(port);
  if (pids.length === 0) continue;
  for (const pid of pids) process.kill(pid);
  console.info(`${checkMark} Port ${port} freed (pid ${pids.join(', ')})`);
  freed += 1;
}
if (freed === 0) console.info(`${checkMark} Nothing listens on this checkout's dev ports`);
