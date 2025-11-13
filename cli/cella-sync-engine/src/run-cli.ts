import pc from "picocolors";
import { select } from "@inquirer/prompts";
import { Command, InvalidArgumentError } from "commander";

import { NAME, DESCRIPTION, VERSION, AUTHOR, GITHUB, WEBSITE } from './constants';
import { config } from "./config";
import { AppConfig } from "./config/types";

// Define CLI configuration
interface CLIConfig {
  args: string[];
  packageManager: string;
  syncService: string;
}

const availableSyncServices = [
  { name: 'Boilerplate → fork (+packages)', value: 'boilerplate-fork+packages', disabled: true },
  { name: 'Boilerplate → fork', value: 'boilerplate-fork' },
  { name: 'Diverged files', value: 'diverged' },
  { name: 'Packages', value: 'packages', disabled: true }
];

// Initialize variables to hold CLI options
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

// Export the CLI configuration for use in other modules
const cli: CLIConfig = {
  args: command.args,
  packageManager,
  syncService,
};

export async function runCli(): Promise<void> {
  // Display CLI version and created by information
  showCliTitle();

  await setSyncService();
  await handleConfiguration();
};

function showCliTitle() {
  console.info();
  console.info(pc.cyan(NAME));
  console.info(DESCRIPTION);
  console.info();
  console.info(`Cli version ${pc.green(VERSION)}`);
  console.info(`Created by ${AUTHOR}`);
  console.info(`${GITHUB} | ${WEBSITE}`);
  console.info();
}

async function setSyncService(): Promise<void> {
  if (!cli.syncService) {
    cli.syncService = await select<string>({
      message: 'Select the sync service you want to use:',
      choices: [
        ...availableSyncServices,
        { name: 'Exit', value: 'exit' },
      ],
    });

    if (cli.syncService === 'exit') {
      process.exit(1);
    }
  } else {
    console.info(`Using sync service: ${pc.cyan(`${cli.syncService}\n`)}`);
  }

  config.syncService = cli.syncService as AppConfig['syncService'];
}

async function handleConfiguration() {
  console.info(`\n${pc.bold(pc.cyan(`${cli.syncService} configuration:`))}`);
  showConfig();

  const configurationState = await select<string>({
    message: 'What do you want to do next?',
    choices: [
      { name: 'continue', value: 'continue' },
      { name: 'Customize configuration', value: 'customize' },
      { name: 'Exit', value: 'exit' },
    ],
  });

  if (configurationState === 'exit') {
    process.exit(1);
  }

  if (configurationState === 'customize') {
    await customizeConfiguration();
    await handleConfiguration();
  }
}

async function customizeConfiguration() {
  let boilerplateUsage: string = config.boilerplate.use;

  const whatToCustomize = await select<string>({
    message: 'Configure:',
    choices: [
      { name: `Boilerplate usage: ${ boilerplateUsage === 'local' ? `${pc.bold('✓Local')} | remote`  : `${pc.bold('✓Remote')} | local`}`, value: 'boilerplateUsage' },
      { name: 'Done', value: 'done' },
    ],
  });

  if (whatToCustomize === 'boilerplateUsage') {
    boilerplateUsage = boilerplateUsage === 'local' ? 'remote' : 'local';
    config.boilerplateUse = boilerplateUsage as 'local' | 'remote';
  }

  if (whatToCustomize !== 'done') {
    await customizeConfiguration();
  }
}

function showConfig() {
  if (config.boilerplate.use === 'local') {
    console.info(`Boilerplate: ${pc.bold('💻')} ${pc.cyan(config.boilerplate.localPath)} <${pc.bold(pc.cyan(config.boilerplate.branch))}> ${pc.bold('🔗')} ${pc.cyan(config.boilerplate.remoteName)}`);
  } else if (config.boilerplate.use === 'remote') {
    console.info(`Boilerplate: ${pc.bold('🌐')} ${pc.cyan(config.boilerplate.remoteUrl)} <${pc.bold(pc.cyan(config.boilerplate.branch))}> ${pc.bold('🔗')} ${pc.cyan(config.boilerplate.remoteName)}`);
  }

  if (config.fork.use === 'local') {
    console.info(`Fork: ${pc.bold('💻')} ${pc.cyan(config.fork.localPath)} <${pc.bold(pc.cyan(config.fork.branch))}> ← <${pc.bold(pc.cyan(config.fork.syncBranch))}>`);
  } else if (config.fork.use === 'remote') {
    console.info(`Fork: ${pc.bold('🌐')} ${pc.cyan(config.fork.remoteUrl)} <${pc.bold(pc.cyan(config.fork.branch))}> ← <${pc.bold(pc.cyan(config.fork.syncBranch))}>`);
  }

  console.info();
}
