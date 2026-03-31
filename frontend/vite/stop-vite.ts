import { exec } from 'node:child_process';
import os from 'node:os';
import pc from 'picocolors';

const checkMark = pc.bold(pc.greenBright('✔'));

const isWindows = os.platform() === 'win32';

/**
 * Stop any running Vite processes.
 */
const stopVite = () => {
  const logStopped = () => {
    console.info(' ');
    console.info(`${checkMark} Vite stopped`);
    console.info(' ');
  };
  const logError = (message: string) => console.error(`✖ Failed to stop Vite: ${message}`);

  if (isWindows) {
    // Windows PowerShell command
    exec(`powershell -Command "Get-Process vite -ErrorAction SilentlyContinue | Stop-Process -Force"`, (err) => {
      if (err) logError(err.message);
      else logStopped();
    });
  } else {
    // macOS/Linux command
    exec('pkill -f vite || true', (err) => {
      if (err) logError(err.message);
      else logStopped();
    });
  }
};

stopVite();
