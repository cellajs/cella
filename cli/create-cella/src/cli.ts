import { basename, resolve } from 'node:path';
import { Command, InvalidArgumentError } from 'commander';

import { NAME } from './constants.ts';
import { packageJson } from './utils/package-json.ts';
import { validateProjectName } from './utils/validate-project-name.ts';

// Define types for CLI options
interface CLIOptions {
  skipNewBranch: boolean;
  skipClean: boolean;
  skipGit: boolean;
  skipInstall: boolean;
  skipGenerate: boolean;
  newBranchName?: string;
}

// Define CLI configuration
interface CLIConfig {
  options: CLIOptions;
  args: string[];
  directory: string | null;
  newBranchName: string | null;
  createNewBranch: boolean | null;
  packageManager: string;
}

// Initialize CLI variables
let directory: string | null = null;
let newBranchName: string | null = null;
let createNewBranch: boolean | null = null;
const packageManager = 'pnpm';

// Set up the CLI command using Commander
export const command = new Command(NAME)
  .version(
    packageJson.version,
    '-v, --version',
    `Output the current version of ${NAME}.`
  )
  .argument('[directory]', 'The directory name for the new project.')
  .usage('[directory] [options]')
  .helpOption('-h, --help', 'Display this help message.')
  .option('--skip-new-branch', 'Skip creating a new branch during initialization.', false)
  .option('--skip-install', 'Skip the installation of packages.', false)
  .option('--skip-generate', 'Skip generating SQL files.', false)
  .option('--skip-clean', 'Skip cleaning the `cella` template.', false)
  .option('--skip-git', 'Skip initializing a git repository.', false)
  .option(
    '--new-branch-name <name>',
    'Specify a new branch name to create and use.',
    (name: string) => {
        if (typeof name === 'string') {
            name = name.trim();
        }

        if (name) {
            const validation = validateProjectName(basename(resolve(name)));

            if (!validation.valid) {
              throw new InvalidArgumentError(
                `Invalid branch name: ${validation.problems[0]}`
              );
            }
      
            createNewBranch = true;
            newBranchName = name;
        }
    }
  )
  .action((name: string) => {
    if (typeof name === 'string') {
        name = name.trim();
    }

    if (name) {
        const validation = validateProjectName(basename(resolve(name)));

        if (!validation.valid) {
            throw new InvalidArgumentError(
                `Invalid project name: ${validation.problems[0]}`
            );
        }

        directory = name;
    }
  })
  .parse();

// Gather the CLI options and arguments
const options: CLIOptions = command.opts<CLIOptions>({
  skipNewBranch: false,
  skipClean: false,
  skipGit: false,
  skipInstall: false,
  skipGenerate: false,
});

// Export the CLI configuration for use in other modules
export const cli: CLIConfig = {
  options,
  args: command.args,
  directory,
  newBranchName,
  createNewBranch,
  packageManager,
};
