import { spawn } from 'node:child_process';
import pc from 'picocolors';
import { checkMark } from '#/utils/console';
import type { GenerateScript } from '#/../scripts/types';

// Re-export for convenience
export type { GenerateScript } from '#/../scripts/types';

/**
 * Run a shell command and return a promise.
 */
function runCommand(command: string, cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, {
      shell: true,
      cwd,
      stdio: 'inherit',
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Command failed with exit code ${code}`));
      }
    });

    child.on('error', reject);
  });
}

/**
 * Sleep for a given number of milliseconds.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Run all generation scripts from the backend directory.
 *
 * Scripts are executed in order:
 * 1. 'drizzle' type scripts run first (schema → SQL generation)
 * 2. 'migration' type scripts run after (custom migrations that upsert to drizzle folder)
 *
 * A 1-second delay is added between migration scripts to ensure unique timestamps.
 *
 * Note: Scripts must be invoked from the backend directory (e.g., via pnpm generate).
 */
export async function runGenerateScripts(scripts: GenerateScript[]): Promise<void> {
  const backendDir = process.cwd();

  // Sort: drizzle scripts first, then migration scripts
  const sortedScripts = [...scripts].sort((a, b) => {
    if (a.type === 'drizzle' && b.type !== 'drizzle') return -1;
    if (a.type !== 'drizzle' && b.type === 'drizzle') return 1;
    return 0;
  });

  console.info('');
  console.info(pc.bold(`Running ${sortedScripts.length} generation scripts...`));
  console.info('');

  let lastWasDrizzle = false;
  let lastWasMigration = false;

  for (const script of sortedScripts) {
    // Add 1-second delay before first migration (after Drizzle) and between migrations
    if (script.type === 'migration' && (lastWasDrizzle || lastWasMigration)) {
      await sleep(1000);
    }

    const typeLabel = script.type === 'drizzle' ? 'drizzle' : 'migration';
    const label = pc.cyan(`[${script.name}]`);
    const tagInfo = script.migrationTag ? pc.dim(` → ${script.migrationTag}`) : '';
    console.info(`${label} ${pc.dim(`(${typeLabel})`)}${tagInfo} Starting...`);

    try {
      await runCommand(script.command, backendDir);
      console.info(`${label} ${pc.green('Done')}`);
      console.info('');
    } catch (err) {
      console.error(`${label} ${pc.red('Failed')}`);
      throw err;
    }

    lastWasDrizzle = script.type === 'drizzle';
    lastWasMigration = script.type === 'migration';
  }

  console.info(`${checkMark} ${pc.bold('All generation scripts completed')}`);
  console.info('');
}
