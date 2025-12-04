import { Command } from "commander";

import { NAME, VERSION } from './constants';
import { validateBranchName, validateLocation, validateRemoteName, validateSyncService } from "./modules/cli/commands";
import { CLIConfig } from "./modules/cli/types";
import { handleConfigurationAction, handleSyncService, onInitialConfigLoad } from "./modules/cli/handlers";
import { showConfiguration, showStartingSyncMessage, showWelcome } from "./modules/cli/display";

// Initialize variables to hold CLI options
const packageManager = 'pnpm';
let syncService = '';
let boilerplateBranch = '';
let forkBranch = '';
let forkSyncBranch = '';
let boilerplateLocation = '';
let boilerplateRemoteName = '';
let forkLocation = '';

/**
 * Defines the root CLI command using Commander.
 *
 * This command is responsible for:
 * - accepting CLI options (branches, locations, sync service, etc.)
 * - validating user input using dedicated validator functions
 * - providing version/help output
 *
 * All options mutate local variables above (Commander runs option handlers
 * immediately during parsing). These values are later combined into a final
 * `CLIConfig` object that flows through the rest of the CLI pipeline.
 */
export const command = new Command(NAME)
  .version(VERSION, '-v, --version', `Output the current version of ${NAME}.`)
  .usage('[options]')
  .helpOption('-h, --help', 'Display this help message.')
  .option(
    '--sync-service <name>',
    'Explicitly tell the CLI which sync service to use.',
    (name: string) => { syncService = validateSyncService(name); },
  )
  .option(
    '--boilerplate-location <location>',
    'What location of the boilerplate to use (local|remote).',
    (location: string) => { boilerplateLocation = validateLocation(location); },
  )
  .option(
    '--boilerplate-branch <name>',
    'What branch of the boilerplate to use.',
    (name: string) => { boilerplateBranch = validateBranchName(name); },
  )
  .option(
    '--boilerplate-remote-name <name>',
    'What remote name to use for the boilerplate.',
    (name: string) => { boilerplateRemoteName = validateRemoteName(name); },
  )
  .option(
    '--fork-location <location>',
    'What location of the fork to use (local|remote).',
    (location: string) => { forkLocation = validateLocation(location); },
  )
  .option(
    '--fork-branch <name>',
    'What branch of the fork to use.',
    (name: string) => { forkBranch = validateBranchName(name); },
  )
  .option(
    '--fork-sync-branch <name>',
    'What sync branch of the fork to use.',
    (name: string) => { forkSyncBranch = validateBranchName(name); },
  )
  .parse();

/**
 * Aggregated CLI configuration for the rest of the cli pipeline.
 *
 * These values are passed to the:
 * - initial config loader
 * - sync service selector
 * - configuration action handler
 * - display modules
 */
const cli: CLIConfig = {
  args: command.args,
  packageManager,
  syncService,
  boilerplateLocation,
  boilerplateRemoteName,
  boilerplateBranch,
  forkLocation,
  forkBranch,
  forkSyncBranch,
};

/**
 * Entry point for running the full CLI experience.
 *
 * @returns A Promise that resolves when all CLI stages complete.
 */
export async function runCli(): Promise<void> {
  // Display welcome message
  showWelcome();

  // Applies CLI flags and loads base config
  onInitialConfigLoad(cli);

  // Prompt sync service
  await handleSyncService(cli);

  // Display the current configuration
  showConfiguration();

  // Prompt for additional configuration actions
  await handleConfigurationAction(cli);

  // Display the CLI will now hand off to core sync logic.
  showStartingSyncMessage();
};
