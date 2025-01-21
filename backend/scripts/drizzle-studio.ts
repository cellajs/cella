import { spawn } from 'node:child_process';
import chalk from 'chalk';

const startDrizzleStudioInBackground = () => {
  const studioProcess = spawn('npx', ['drizzle-kit', 'studio', '--config', 'drizzle.config.ts'], {
    detached: true, // Detach the process
    stdio: 'ignore', // Ignore its output to let the parent process exit cleanly
    shell: true, // Use shell for compatibility
  });

  // Detach the child process from the parent
  studioProcess.unref();

  console.log(' ');
  console.log(`${chalk.greenBright.bold('✔')} Drizzle Studio started in the background`);
  console.log(' ');
};

startDrizzleStudioInBackground();
