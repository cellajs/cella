import dotenv from 'dotenv';
import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { STUDIO_PORT } from './port';
import { checkMark } from '#/utils/console';

const __dirname = dirname(fileURLToPath(import.meta.url));
const parentDir = resolve(__dirname, '..');

// Load .env variables from the parent directory
dotenv.config({ path: resolve(parentDir, '.env') });

/**
 * Start Drizzle Studio programmatically.
 */
const startDrizzleStudio = () => {
  const cmd = `pnpm exec drizzle-kit studio --config drizzle.config.ts --port ${STUDIO_PORT}`;
  const studioProcess = spawn(cmd, { cwd: parentDir, stdio: 'inherit', shell: true });

  console.info(' ');
  console.info(`${checkMark} Drizzle Studio started`);
  console.info(' ');

  const cleanup = (code: number | null) => {
    if (code === 130) process.exit(0);
    process.exit(code ?? 0);
  };

  studioProcess.on('close', (code) => {
    cleanup(code);
  });

  process.on('SIGINT', () => {
    studioProcess.kill('SIGINT');
  });

  process.on('SIGTERM', () => {
    studioProcess.kill('SIGTERM');
  });
};

startDrizzleStudio();
