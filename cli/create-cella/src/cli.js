import { basename, resolve } from 'node:path'
import { Command, InvalidArgumentError } from 'commander'

import { NAME } from './constants.js'

import { packageJson } from './utils/package-json.js'
import { validateProjectName } from './utils/validate-project-name.js'

// Initialize CLI variables
let directory = null;
let newBranchName = null;
let createNewBranch = null;
const packageManager = 'pnpm';

// Set up the CLI command using Commander
export const command = new Command(NAME)
  .version(packageJson.version, '-v, --version', `Output the current version of ${NAME}.`)
  .argument('[directory]', 'The directory name for the new project.')
  .usage('[directory] [options]')
  .helpOption('-h, --help', 'Display this help message.')
  .option(
    '--skip-new-branch',
    'Skip creating a new branch during initialization.',
    false,
  )
  .option(
    '--skip-install',
    'Skip the installation of packages.',
    false,
  )
  .option(
    '--skip-generate',
    'Skip generating SQL files.',
    false,
  )
  .option(
    '--skip-clean',
    'Skip cleaning the `cella` template.',
    false,
  )
  .option(
    '--skip-git',
    'Skip initializing a git repository.',
    false,
  )
  .option(
      '--new-branch-name <name>',
      'Specify a new branch name to create and use.',
      (name) => {
        if (typeof name === 'string') {
          name = name.trim();
        }

        if (name) {
          const validation = validateProjectName(basename(resolve(name)))
          if (!validation.valid) throw new InvalidArgumentError(`Invalid branch name: ${validation.problems[0]}`);

          createNewBranch = true;
          newBranchName = name;
        }
      },
  )
  .action((name) => {
      if (typeof name === 'string') {
        name = name.trim()
      }

      if (name) {
        const validation = validateProjectName(basename(resolve(name)));
        if (!validation.valid) throw new InvalidArgumentError(`Invalid project name: ${validation.problems[0]}`);

        directory = name;
      }
    })
  .parse();

// Gather the CLI options and arguments
const options = command.opts({ 
  skipNewBranch: false, 
  skipClean: false,
  skipGit: false, 
  skipInstall: false,
  skipGenerate: false,
 });

 // Export the CLI configuration for use in other modules
export const cli = { 
  options, 
  args: command.args, 
  directory, 
  newBranchName, 
  createNewBranch, 
  packageManager,
};