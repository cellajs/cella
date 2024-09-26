import { basename, resolve } from 'node:path'
import { Command, InvalidArgumentError } from 'commander'
import { NAME } from './constants.js'
import { packageJson } from './utils/package-json.js'
import { validateProjectName } from './utils/validate-project-name.js'

let directory = null;
let newBranchName = null;
let createNewBranch = null;
const packageManager = 'pnpm';

export const command = new Command(NAME)
    .version(packageJson.version, '-v, --version', `Output the current version of ${NAME}.`)
    .argument('[directory]')
    .usage('[directory] [options]')
    .helpOption('-h, --help', 'Display this help message.')
    .option(
      '--skip-new-branch',
      'Explicitly tell the CLI to skip create new branch.',
      false,
    )
    .option(
      '--skip-install',
      'Explicitly tell the CLI to skip installing packages.',
      false,
    )
    .option(
      '--skip-clean',
      'Explicitly tell the CLI to skip cleaning `cella` template.',
      false,
    )
    .option(
      '--skip-git',
      'Explicitly tell the CLI to skip initializing git.',
      false,
    )
    .option(
        `--new-branch-name <name>`,
        `Explicitly tell the CLI to create and use this new branch`,
        (name) => {
            if (typeof name === 'string') {
                name = name.trim()
              }
              if (name) {
                const validation = validateProjectName(basename(resolve(name)))
                if (!validation.valid) {
                  throw new InvalidArgumentError(
                    `Invalid branch name: ${validation.problems[0]}`,
                  )
                }
                createNewBranch = true
                newBranchName = name
              }
        },
    )
    .action((name) => {
        if (typeof name === 'string') {
          name = name.trim()
        }
        if (name) {
          const validation = validateProjectName(basename(resolve(name)))
          if (!validation.valid) {
            throw new InvalidArgumentError(
              `Invalid project name: ${validation.problems[0]}`,
            )
          }
          directory = name
        }
      })
    .parse();

const options = command.opts({ skipNewBranch: false, skipClean: false, skipGit: false, skipInstall: false })

export const cli = { options, args: command.args, directory, newBranchName, createNewBranch, packageManager }