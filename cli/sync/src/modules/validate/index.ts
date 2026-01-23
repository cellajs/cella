/**
 * Validate module - Runs pnpm install && pnpm check to ensure fork is stable.
 *
 * This is phase 5 of the sync pipeline. Runs on sync-branch after packages.
 * Ensures all dependencies are installed and code passes type/lint checks
 * BEFORE squashing to development.
 *
 * On failure, prompts user to:
 * - Fix issues and retry
 * - Continue anyway (with warning)
 * - Abort sync (resets sync-branch)
 */

import { select } from '@inquirer/prompts';
import { spawn } from 'child_process';
import pc from 'picocolors';
import { config } from '#/config';
import { gitAddAll } from '#/utils/git/command';
import { createProgress, pauseSpinner, resumeSpinner } from '#/utils/progress';

type ValidationAction = 'retry' | 'continue' | 'abort';

/**
 * Runs a command with streaming output to the console.
 *
 * @param command - The command to run
 * @param args - Command arguments
 * @param cwd - Working directory
 * @returns Promise resolving to success boolean
 */
async function runCommandStreamed(command: string, args: string[], cwd: string): Promise<boolean> {
  return new Promise((resolve) => {
    const proc = spawn(command, args, {
      cwd,
      stdio: ['inherit', 'inherit', 'inherit'],
      shell: true,
    });

    proc.on('close', (code) => {
      resolve(code === 0);
    });

    proc.on('error', () => {
      resolve(false);
    });
  });
}

/**
 * Prompts user for action when validation fails.
 */
async function promptValidationFailed(step: string): Promise<ValidationAction> {
  console.info();
  console.info(pc.red(`✗ ${step} failed`));
  console.info();

  const action = await select<ValidationAction>({
    message: 'What would you like to do?',
    choices: [
      {
        name: 'Fix issues manually, then retry validation',
        value: 'retry',
      },
      {
        name: 'Continue anyway (not recommended - may leave fork in broken state)',
        value: 'continue',
      },
      {
        name: 'Abort sync (reset sync-branch to pre-merge state)',
        value: 'abort',
      },
    ],
  });

  return action;
}

/**
 * Runs validation: pnpm install && pnpm check.
 *
 * Loops until validation passes or user chooses to continue/abort.
 * On success or continue, stages all changes (including generated files).
 *
 * @throws Error if user chooses to abort
 */
export async function runValidate(): Promise<void> {
  const progress = createProgress('validating');
  const repoRoot = config.workingDirectory;

  await progress.wrap(async () => {
    while (true) {
      // Run pnpm install
      progress.step('running pnpm install');
      pauseSpinner();
      console.info();

      const installSuccess = await runCommandStreamed('pnpm', ['install'], repoRoot);

      if (!installSuccess) {
        const action = await promptValidationFailed('pnpm install');
        if (action === 'abort') {
          throw new Error('Sync aborted by user during validation');
        }
        if (action === 'retry') {
          resumeSpinner();
          continue;
        }
        // continue anyway - break out of loop
        break;
      }

      // Run pnpm check
      progress.step('running pnpm check');
      console.info();

      const checkSuccess = await runCommandStreamed('pnpm', ['check'], repoRoot);

      if (!checkSuccess) {
        const action = await promptValidationFailed('pnpm check');
        if (action === 'abort') {
          throw new Error('Sync aborted by user during validation');
        }
        if (action === 'retry') {
          resumeSpinner();
          continue;
        }
        // continue anyway - break out of loop
        console.info(pc.yellow('⚠ Continuing with validation errors'));
        break;
      }

      // Success!
      console.info();
      console.info(pc.green('✓ Validation passed'));
      resumeSpinner();
      break;
    }

    // Stage all changes (synced files + package.json + generated api.gen + lint fixes)
    progress.step('staging all changes');
    await gitAddAll(repoRoot);

    progress.done('validated and staged');
  });
}
