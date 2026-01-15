/**
 * Generate Runner
 *
 * Runs all configured generation scripts from appConfig.generateScripts.
 * Provides consistent logging and error handling.
 */

import { spawn } from 'node:child_process';
import { join } from 'node:path';
import pc from 'picocolors';

export interface GenerateScript {
  /** Human-readable name for the script */
  name: string;
  /** Shell command to run */
  command: string;
}

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
 * Run all generation scripts.
 */
export async function runGenerateScripts(scripts: GenerateScript[]): Promise<void> {
  const backendDir = join(import.meta.dirname, '../..');

  console.info('');
  console.info(pc.bold(`Running ${scripts.length} generation scripts...`));
  console.info('');

  for (const script of scripts) {
    const label = pc.cyan(`[${script.name}]`);
    console.info(`${label} Starting...`);

    try {
      await runCommand(script.command, backendDir);
      console.info(`${label} ${pc.green('Done')}`);
      console.info('');
    } catch (err) {
      console.error(`${label} ${pc.red('Failed')}`);
      throw err;
    }
  }

  console.info(pc.bold(pc.greenBright('✔ All generation scripts completed')));
  console.info('');
}
