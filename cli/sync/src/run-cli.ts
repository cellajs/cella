import { Command } from 'commander';

import { NAME, VERSION } from '#/constants';
import { validateBranchName, validateLocation, validateRemoteName, validateSyncService } from '#/modules/cli/commands';
import { showConfiguration, showStartedMessage, showWelcome } from '#/modules/cli/display';
import { handleSyncService, onInitialConfigLoad } from '#/modules/cli/handlers';
import { CLIConfig } from '#/modules/cli/types';

// Initialize variables to hold CLI options
const packageManager = 'pnpm';
let syncService = '';
let upstreamBranch = '';
let forkBranch = '';
let forkSyncBranch = '';
let upstreamLocation = '';
let upstreamRemoteName = '';
let forkLocation = '';
let ciMode = false;
let debugMode = false;
let skipPackages = false;

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
const command = new Command(NAME)
  .version(VERSION, '-v, --version', `output the current version of ${NAME}`)
  .usage('[options]')
  .helpOption('-h, --help', 'display this help message')
  .option('-y, --yes', 'skip interactive prompts and use defaults/CLI flags (CI mode)', () => {
    ciMode = true;
  })
  .option('-d, --debug', 'show verbose debug output', () => {
    debugMode = true;
  })
  .option('--skip-packages', 'skip package.json dependency synchronization during sync', () => {
    skipPackages = true;
  })
  .option('--sync-service <name>', 'explicitly tell the CLI which sync service to use', (name: string) => {
    syncService = validateSyncService(name);
  })
  .option(
    '--upstream-location <location>',
    'what location of the upstream to use (local|remote)',
    (location: string) => {
      upstreamLocation = validateLocation(location);
    },
  )
  .option('--upstream-branch <name>', 'what branch of the upstream to use', (name: string) => {
    upstreamBranch = validateBranchName(name);
  })
  .option('--upstream-remote-name <name>', 'what remote name to use for the upstream', (name: string) => {
    upstreamRemoteName = validateRemoteName(name);
  })
  .option('--fork-location <location>', 'what location of the fork to use (local|remote)', (location: string) => {
    forkLocation = validateLocation(location);
  })
  .option('--fork-branch <name>', 'what branch of the fork to use', (name: string) => {
    forkBranch = validateBranchName(name);
  })
  .option('--fork-sync-branch <name>', 'what sync branch of the fork to use', (name: string) => {
    forkSyncBranch = validateBranchName(name);
  })
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
  upstreamLocation,
  upstreamRemoteName,
  upstreamBranch,
  forkLocation,
  forkBranch,
  forkSyncBranch,
  ci: ciMode,
  debug: debugMode,
  skipPackages,
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

  // Prompt sync service (if not provided via CLI)
  await handleSyncService(cli);

  // Display the current configuration
  showConfiguration();

  // Display the CLI will now hand off to core sync logic.
  showStartedMessage();
}
