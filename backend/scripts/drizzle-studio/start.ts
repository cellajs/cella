import dotenv from 'dotenv';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { STUDIO_PORT } from './port';
import { checkMark } from '../../src/utils/console';

const __dirname = dirname(fileURLToPath(import.meta.url));
const parentDir = resolve(__dirname, '../..');

// Load .env variables from the parent directory
dotenv.config({ path: resolve(parentDir, '.env'), quiet: true });

/**
 * Start Drizzle Studio programmatically.
 */
const canListenOnStudioPort = () =>
  new Promise<boolean>((resolve, reject) => {
    const server = createServer();

    server.once('error', (error: NodeJS.ErrnoException) => {
      if (error.code === 'EADDRINUSE') {
        resolve(false);
        return;
      }

      reject(error);
    });

    server.once('listening', () => {
      server.close(() => resolve(true));
    });

    server.listen(STUDIO_PORT, '127.0.0.1');
  });

const startDrizzleStudio = async () => {
  if (!(await canListenOnStudioPort())) {
    console.info(' ');
    console.info(`${checkMark} Drizzle Studio already running on https://local.drizzle.studio?port=${STUDIO_PORT}`);
    console.info(' ');
    return;
  }

  // Use tsx to run drizzle-kit so path aliases (#/) are resolved
  const cmd = `pnpm tsx node_modules/drizzle-kit/bin.cjs studio --config drizzle.config.ts --port ${STUDIO_PORT}`;
  const studioProcess = spawn(cmd, { cwd: parentDir, stdio: 'inherit', shell: true });

  console.info(' ');
  console.info(`${checkMark} Drizzle Studio starting on https://local.drizzle.studio?port=${STUDIO_PORT}`);
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
