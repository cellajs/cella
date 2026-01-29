/**
 * Validate service for sync CLI v2.
 *
 * Runs pnpm install && pnpm check to validate the synced code.
 */

import { spawn } from 'node:child_process';
import pc from 'picocolors';
import type { RuntimeConfig } from '../config/types';
import { createSpinner, spinnerFail, spinnerSuccess } from '../utils/display';

/**
 * Run a command and stream output.
 */
async function runCommand(command: string, args: string[], cwd: string): Promise<{ success: boolean; output: string }> {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd,
      stdio: ['inherit', 'pipe', 'pipe'],
      shell: true,
    });

    let output = '';

    child.stdout?.on('data', (data) => {
      output += data.toString();
    });

    child.stderr?.on('data', (data) => {
      output += data.toString();
    });

    child.on('close', (code) => {
      resolve({ success: code === 0, output });
    });

    child.on('error', (error) => {
      output += error.message;
      resolve({ success: false, output });
    });
  });
}

/**
 * Run the validate service.
 *
 * Executes pnpm install && pnpm check to validate synced code.
 */
export async function runValidate(config: RuntimeConfig): Promise<boolean> {
  const { forkPath } = config;

  // Step 1: pnpm install
  createSpinner('Running pnpm install...');

  const installResult = await runCommand('pnpm', ['install'], forkPath);

  if (!installResult.success) {
    spinnerFail('pnpm install failed');
    console.info();
    console.info(pc.dim(installResult.output.slice(-1000))); // Last 1000 chars
    return false;
  }

  spinnerSuccess('Dependencies installed');

  // Step 2: pnpm check
  createSpinner('Running pnpm check...');

  const checkResult = await runCommand('pnpm', ['check'], forkPath);

  if (!checkResult.success) {
    spinnerFail('pnpm check failed');
    console.info();
    console.info(pc.dim(installResult.output.slice(-1000))); // Last 1000 chars
    return false;
  }

  spinnerSuccess('Validation passed');

  return true;
}
