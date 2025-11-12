import pc from "picocolors";
import { select } from "@inquirer/prompts";

import { NAME, DESCRIPTION, VERSION, AUTHOR, GITHUB, WEBSITE } from './constants';
import { Command, InvalidArgumentError } from "commander";

import { config } from "./config";

// Define types for CLI options
interface CLIOptions { }

// Define CLI configuration
interface CLIConfig {
  options: CLIOptions;
  args: string[];
  packageManager: string;
  syncService: string;
}

const availableSyncServices = [
  { name: 'Boilerplate → fork (+packages)', value: 'boilerplate-fork+packages', disabled: true },
  { name: 'Boilerplate → fork', value: 'boilerplate-fork' },
  { name: 'Diverged files', value: 'diverged', disabled: true },
  { name: 'Packages', value: 'packages', disabled: true }
];

let syncService = '';
const packageManager = 'pnpm';

// Set up the CLI command using Commander
export const command = new Command(NAME)
  .version(VERSION, '-v, --version', `Output the current version of ${NAME}.`)
  .usage('[options]')
  .helpOption('-h, --help', 'Display this help message.')
  .option('--sync-service <name>', 'Explicitly tell the CLI to use this sync service.', (name: string) => {
    name = name.trim();
    if (!availableSyncServices.some(service => service.value === name)) {
      throw new InvalidArgumentError(`Invalid sync service: ${name}. Supported services are ${availableSyncServices.map((service: any) => `"${service.value}"`).join(', ')}.`);
    }
    syncService = name;
  })
  .parse();

// Gather the CLI options and arguments
const options: CLIOptions = command.opts<CLIOptions>();

// Export the CLI configuration for use in other modules
const cli: CLIConfig = {
  options,
  args: command.args,
  packageManager,
  syncService,
};

export async function runCli(): Promise<void> {
  // Display CLI version and created by information }
  console.info();
  console.info(pc.cyan(NAME));
  console.info(DESCRIPTION);
  console.info();
  console.info(`Cli version ${pc.green(VERSION)}`);
  console.info(`Created by ${AUTHOR}`);
  console.info(`${GITHUB} | ${WEBSITE}`);
  console.info();

  if (!cli.syncService) {
    cli.syncService = await select<string>({
      message: 'Select the sync service you want to use:',
      choices: [
        ...availableSyncServices,
        { name: 'Cancel', value: 'cancel' },
      ],
    });

    if (cli.syncService === 'cancel') {
      process.exit(1);
    }
  } else {
    console.info(`Using sync service: ${pc.cyan(`${cli.syncService}\n`)}`);
  }

  console.info(`\nThe next configuration will be used to run ${cli.syncService}:`);
  showConfig(cli);

  const configurationState = await select<string>({
    message: 'What do you want to do next?',
    choices: [
      { name: 'continue', value: 'continue' },
      { name: 'Customize configuration', value: 'customize' },
      { name: 'Show full configuration', value: 'show-full-config' },
      { name: 'Cancel', value: 'cancel' },
    ],
  });

  if (configurationState === 'cancel') {
    process.exit(1);
  }

  if (configurationState === 'show-config') {
    showConfig(cli);
  }
};

function showConfig(cliConfig: CLIConfig) {
  console.info();

  if (config.boilerplate.use === 'local') {
    console.info(`Boilerplate: ${pc.cyan(config.boilerplate.localPath)} <${pc.bold(pc.cyan(config.boilerplate.branch))}>`);
  } else if (config.boilerplate.use === 'remote') {
    console.info(`Boilerplate: ${pc.cyan(config.boilerplate.remoteUrl)} <${pc.bold(pc.cyan(config.boilerplate.branch))}>`);
  }

  if (config.fork.use === 'local') {
    console.info(`Fork: ${pc.cyan(config.fork.localPath)} <${pc.bold(pc.cyan(config.fork.branch))}>`);
  } else if (config.fork.use === 'remote') {
    console.info(`Fork: ${pc.cyan(config.fork.remoteUrl)} <${pc.bold(pc.cyan(config.fork.branch))}>`);
  }

  if (config.syncService === 'boilerplate-fork') {
    console.info(`Sync branch: ${pc.bold(pc.cyan(config.fork.branch))}`);
    console.info(`Upstream: ${pc.bold(pc.cyan(config.boilerplate.remoteName))}`);
  }

  console.info();
}
