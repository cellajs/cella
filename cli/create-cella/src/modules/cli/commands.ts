import { basename, resolve } from 'node:path';
import { Command, InvalidArgumentError } from 'commander';

import { NAME, VERSION } from '#/constants';
import { validateProjectName } from '#/utils/validate-project-name';
import type { CLIConfig, CLIOptions } from './types';

// Initialize CLI variables
let directory: string | null = null;
let newBranchName: string | null = null;
let createNewBranch: boolean | null = null;
const packageManager = 'pnpm';

/**
 * Defines the root CLI command using Commander.
 * This command accepts CLI options and validates user input.
 */
export const command = new Command(NAME)
  .version(VERSION, '-v, --version', `output the current version of ${NAME}`)
  .argument('[directory]', 'the directory name for the new project')
  .usage('[directory] [options]')
  .helpOption('-h, --help', 'display this help message')
  .option('--template <path>', 'use a custom template (local path or github:user/repo)')
  .action((name: string) => {
    if (typeof name === 'string') {
      name = name.trim();
    }

    if (name) {
      const validation = validateProjectName(basename(resolve(name)));

      if (!validation.valid) {
        throw new InvalidArgumentError(`Invalid project name: ${validation.problems?.[0] ?? 'unknown error'}`);
      }

      directory = name;
    }
  })
  .parse();

// Gather the CLI options and arguments
const options: CLIOptions = command.opts<CLIOptions>();

/**
 * Runs the CLI and returns the parsed configuration.
 * This function parses command line arguments and returns the CLI config.
 */
export function runCli(): CLIConfig {
  return {
    options,
    args: command.args,
    directory,
    newBranchName,
    createNewBranch,
    packageManager,
  };
}

// Export CLI configuration for direct import
export const cli: CLIConfig = runCli();
