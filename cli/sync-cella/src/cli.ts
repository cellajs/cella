import { basename, resolve } from 'node:path';
import { Command, InvalidArgumentError } from 'commander';
import { NAME } from './constants';
import { packageJson } from './utils/package-json';
import { validateProjectName } from './utils/validate-project-name';

interface CommandOptions {
  configFile?: string;
  upstreamBranch?: string;
  useRebase?: boolean;
}

interface CLI {
  options: CommandOptions;
  args: string[];
  syncService: string;
  upstreamBranch: string;
  configFile: string;
  packageManager: string;
  localBranch: string;
}

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
    'Explicitly tell the CLI to use this config file.',
    (name: string) => {
      name = name.trim();
      if (!['.js', '.json', '.ts'].some(ext => name.endsWith(ext))) {
        throw new InvalidArgumentError(`Unsupported config file: ${name}. Supported extensions are ".js", ".json", ".ts".`);
      }
      configFile = name;
    }
  )
  .option(
    '--upstream-branch <name>',
    'Explicitly tell the CLI to use this upstream branch.',
    (name: string) => {
      name = name.trim();
      if (name) {
        const validation = validateProjectName(basename(resolve(name)));
        if (!validation.valid) {
          throw new InvalidArgumentError(`Invalid branch name: ${validation.problems?.[0] || 'Unknown error'}`);
        }
        upstreamBranch = name;
      }
    }
  )
  .action((name: string) => {
    name = name.trim();
    if (!['diverged', 'pull-upstream', 'pull-fork'].includes(name)) {
      throw new InvalidArgumentError(`Invalid sync service: ${name}. Supported services are "diverged", "pull-upstream", "pull-fork".`);
    }
    syncService = name;
  })
  .parse();

const options = command.opts<CommandOptions>({ useRebase: false });

export const cli: CLI = {
  options,
  args: command.args,
  syncService,
  upstreamBranch,
  configFile,
  packageManager,
  localBranch,
};
