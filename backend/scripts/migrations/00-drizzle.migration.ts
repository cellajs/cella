import { spawn } from 'node:child_process';
import type { GenerateScript } from '../types';

/**
 * Run drizzle-kit generate to create SQL migrations from schema changes.
 * Uses tsx so path aliases (#/) are resolved.
 */
function runDrizzleKit(): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn('tsx node_modules/drizzle-kit/bin.cjs generate --config drizzle.config.ts', {
      shell: true,
      cwd: process.cwd(),
      stdio: 'inherit',
    });

    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`drizzle-kit exited with code ${code}`));
    });

    child.on('error', reject);
  });
}

export const generateConfig: GenerateScript = {
  name: 'Drizzle migrations',
  type: 'drizzle',
  run: runDrizzleKit,
};
