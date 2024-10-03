import { basename, resolve } from 'node:path'
import { Command, InvalidArgumentError } from 'commander'
import { NAME } from './constants.js'
import { packageJson } from './utils/package-json.js'
import { validateProjectName } from './utils/validate-project-name.js'

let syncService = '';
let upstreamBranch = '';
let configFile = '';
const packageManager = 'pnpm';
const localBranch = '';

export const command = new Command(NAME)
    .version(packageJson.version, '-v, --version', `Output the current version of ${NAME}.`)
    .argument('[sync-service]')
    .usage('[sync-service] [options]')
    .helpOption('-h, --help', 'Display this help message.')
    .option(
        '--config-file <path>',
        'Explicitly tell the CLI to use this config-file.',
        (name) => {
          if (typeof name === 'string') {
              name = name.trim()
            }
            if (!['.js', '.json', '.ts'].some(ext => name.endsWith(ext))) {
              throw new InvalidArgumentError(`Unsupported config-file: ${name}, supported: ".js", ".json", ".ts"`)
            }
            configFile = name
      })
      .option(
        `--upstream-branch <name>`,
        `Explicitly tell the CLI to use this upstream-branch.`,
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
                upstreamBranch = name
              }
        },
    )
    .action((name) => {
        if (typeof name === 'string') {
          name = name.trim()
        }
        if (!['diverged', 'merge-upstream'].includes(name)) {
            throw new InvalidArgumentError(`Invalid sync-service: ${name}, supported: "diverged", "merge-upstream"`)
          }
          syncService = name
      })
    .parse();

const options = command.opts({  })

export const cli = { options, args: command.args, syncService, upstreamBranch, configFile, packageManager, localBranch }