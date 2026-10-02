import { exec } from 'node:child_process';
import os from 'node:os';
import { appConfig } from 'shared';
import { checkMark } from 'shared/utils/console';

const isWindows = os.platform() === 'win32';

// The port this checkout's dev server listens on (vite.config.ts): another checkout's Vite keeps running.
const port = Number(new URL(appConfig.frontendUrl).port) || appConfig.devPorts.frontend;

/**
 * Stop the Vite dev server of this checkout.
 */
const stopVite = () => {
  const logStopped = () => {
    console.info(' ');
    console.info(`${checkMark} Vite stopped (port ${port})`);
    console.info(' ');
  };
  const logError = (message: string) => console.error(`✖ Failed to stop Vite: ${message}`);

  const command = isWindows
    ? `powershell -Command "Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }"`
    : `lsof -tiTCP:${port} -sTCP:LISTEN | xargs kill 2>/dev/null || true`;

  exec(command, (err) => {
    if (err) logError(err.message);
    else logStopped();
  });
};

stopVite();
