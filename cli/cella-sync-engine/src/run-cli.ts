import { Command } from "commander";

import { NAME, VERSION } from './constants';
import { validateBranchName, validateLocation, validateRemoteName, validateSyncService } from "./modules/cli/commands";
import { CLIConfig } from "./modules/cli/types";
import { handleConfigurationAction, handleSyncService, onInitialConfigLoad } from "./modules/cli/handlers";
import { showConfiguration, showStartingSyncMessage, showWelcome } from "./modules/cli/display";

// Initialize variables to hold CLI options
let syncService = '';
let boilerplateBranch = '';
let forkBranch = '';
let forkSyncBranch = '';
let boilerplateLocation = '';
let boilerplateRemoteName = '';
let forkLocation = '';
const packageManager = 'pnpm';

// Set up the CLI command using Commander
export const command = new Command(NAME)
  .version(VERSION, '-v, --version', `Output the current version of ${NAME}.`)
  .usage('[options]')
  .helpOption('-h, --help', 'Display this help message.')
  .option('--sync-service <name>', 'Explicitly tell the CLI to use this sync service.', (name: string) => { syncService = validateSyncService(name); })
  .option('--boilerplate-location <location>', 'What location of the boilerplate to use (local|remote).', (location: string) => { boilerplateLocation = validateLocation(location); })
  .option('--boilerplate-branch <name>', 'What branch of the boilerplate to use.', (name: string) => { boilerplateBranch = validateBranchName(name); })
  .option('--boilerplate-remote-name <name>', 'What remote name to use for the boilerplate.', (name: string) => { boilerplateRemoteName = validateRemoteName(name); })
  .option('--fork-location <location>', 'What location of the fork to use (local|remote).', (location: string) => { forkLocation = validateLocation(location); })
  .option('--fork-branch <name>', 'What branch of the fork to use.', (name: string) => { forkBranch = validateBranchName(name); })
  .option('--fork-sync-branch <name>', 'What sync branch of the fork to use.', (name: string) => { forkSyncBranch = validateBranchName(name); })
  .parse();

// Export the CLI configuration for use in other modules
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
 * Run the CLI application.
 */
export async function runCli(): Promise<void> {
  // Display welcome message
  showWelcome();

  // Pass the CLI configuration to update config on initial load
  onInitialConfigLoad(cli);

  // Handle sync service selection
  await handleSyncService(cli);

  // Show current configuration
  showConfiguration();

  // Handle further configuration actions
  await handleConfigurationAction(cli);

  // Display starting sync message
  showStartingSyncMessage();
};
