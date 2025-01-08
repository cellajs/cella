import { spawn } from 'node:child_process';

// Function to start Drizzle Studio
export const startDrizzleStudio = () => {
  const studioProcess = spawn('npx', ['drizzle-kit', 'studio'], {
    stdio: 'inherit',
    shell: true,
  });

  studioProcess.on('close', (code) => {
    if (code === 0) {
      console.log('Drizzle Studio exited successfully.');
    } else {
      console.error(`Drizzle Studio exited with code ${code}.`);
    }
  });

  studioProcess.on('error', (err) => {
    console.error('Failed to start Drizzle Studio:', err);
  });
};
