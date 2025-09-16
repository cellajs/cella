import { exec } from 'node:child_process';
import os from 'node:os';

const isWindows = os.platform() === 'win32';

const stopVite = () => {
  const logStopped = () => {
    console.info(' ');
    console.info('✔ Vite stopped');
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
