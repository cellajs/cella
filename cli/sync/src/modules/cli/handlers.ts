import pc from "picocolors";

import { CLIConfig, ConfigurationAction, CustomizeOption } from "./types";
import { config } from "../../config";
import { SyncService } from "../../config/sync-services";

import {
  promptConfigurationAction,
  promptSyncService,
  promptWhichConfigurationToCustomize,
  promptConfigureLocation,
  promptConfigureBranch,
  promptDivergedCommitStatusOptions,
  promptConfigureRemoteName,
  promptPackageJsonMode,
  promptConfigureSkipAllPushes,
  promptConfigureMaxGitPreviewsForSquashCommits,
} from "./prompts";

import { AppConfig } from "../../config/types";
import { showConfiguration } from "./display";
import { SYNC_SERVICES } from "../../config/sync-services";

/**
 * Handle sync service selection.
 * 
 * @param cli - The CLI configuration object
 */
export async function handleSyncService(cli: CLIConfig): Promise<void> {
  if (!cli.syncService) {
    if (cli.ci) {
      // In CI mode, default to analyze (safe, non-destructive)
      cli.syncService = SYNC_SERVICES.ANALYZE;
      config.syncService = SYNC_SERVICES.ANALYZE;
      console.info(`Using sync service (CI default): ${pc.cyan(`${cli.syncService}\n`)}`);
    } else {
      cli.syncService = await promptSyncService();
      config.syncService = cli.syncService as AppConfig['syncService'];
    }
  } else {
    console.info(`Using sync service: ${pc.cyan(`${cli.syncService}\n`)}`);
  }
}

/**
 * Handle further configuration actions.
 * 
 * @param cli - The CLI configuration object
 */
export async function handleConfigurationAction(cli: CLIConfig): Promise<void> {
  // Skip prompts in CI mode
  if (cli.ci) {
    return;
  }

  const configurationState: ConfigurationAction = await promptConfigurationAction();

  if (configurationState === 'continue') {
    return;
  }

  if (configurationState === 'customize') {
    await handleCustomizeConfiguration(cli);

    showConfiguration();

    await handleConfigurationAction(cli);
  }
}

/**
 * Handle customization of configuration.
 * 
 * @param cli - The CLI configuration object
 */
export async function handleCustomizeConfiguration(cli: CLIConfig): Promise<void> {
  const configToCustomize: CustomizeOption = await promptWhichConfigurationToCustomize();

  if (configToCustomize === 'boilerplateLocation') {
    await handleCustomizeLocation(cli, 'boilerplate');
  }

  if (configToCustomize === 'forkLocation') {
    await handleCustomizeLocation(cli, 'fork');
  }

  if (configToCustomize === 'boilerplateBranch') {
    await handleCustomizeBranch(cli, 'boilerplate', 'branch');
  }

  if (configToCustomize === 'forkBranch') {
    await handleCustomizeBranch(cli, 'fork', 'branch');
  }

  if (configToCustomize === 'forkSyncBranch') {
    await handleCustomizeBranch(cli, 'fork', 'syncBranch');
  }

  if (configToCustomize === 'boilerplateRemoteName') {
    await handleCustomizeRemoteName(cli, 'boilerplate');
  }

  if (configToCustomize === 'divergedCommitStatus') {
    await handleCustomizeDivergedCommitStatus();
  }

  if (configToCustomize === 'packageJsonMode') {
    await handleCustomizePackageJsonMode();
  }

  if (configToCustomize === 'skipAllPushes') {
    await handleCustomizeSkipAllPushes();
  }

  if (configToCustomize === 'maxGitPreviewsForSquashCommits') {
    await handleCustomizeMaxGitPreviewsForSquashCommits();
  }

  // Recursively handle customization until done
  if (configToCustomize !== 'done') {
    await handleCustomizeConfiguration(cli);
  }
}

/**
 * Handle customization of location.
 * 
 * @param cli - The CLI configuration object
 * @param type - The type of location to customize ('boilerplate' or 'fork')
 */
export async function handleCustomizeLocation(cli: CLIConfig, type: 'boilerplate' | 'fork'): Promise<void> {
  if (type === 'fork') {
    cli.forkLocation = await promptConfigureLocation('fork');
    config.forkLocation = cli.forkLocation as 'local' | 'remote';
  }
  if (type === 'boilerplate') {
    cli.boilerplateLocation = await promptConfigureLocation('boilerplate');
    config.boilerplateLocation = cli.boilerplateLocation as 'local' | 'remote';
  }
}

/**
 * Handle customization of branch.
 * 
 * @param cli - The CLI configuration object
 * @param type - The repository type of the branch to customize ('boilerplate' or 'fork')
 * @param branchType - The specific branch type to customize ('branch' or 'syncBranch')
 */
export async function handleCustomizeBranch(cli: CLIConfig, type: 'boilerplate' | 'fork', branchType: 'branch' | 'syncBranch'): Promise<void> {
  if (type === 'fork') {
    const branch = await promptConfigureBranch('fork', branchType);
    cli.forkBranch = branch;
    config.fork = { [branchType]: branch };
  }
  if (type === 'boilerplate') {
    const branch = await promptConfigureBranch('boilerplate', branchType);
    cli.boilerplateBranch = branch;
    config.boilerplate = { [branchType]: branch };
  }
}

/**
 * Handle customization of remote name.
 * 
 * @param cli - The CLI configuration object
 * @param type - The type of remote name to customize ('boilerplate')
 */
export async function handleCustomizeRemoteName(cli: CLIConfig, type: 'boilerplate'): Promise<void> {
  const remoteName = await promptConfigureRemoteName(type);
  if (type === 'boilerplate') {
    cli.boilerplateRemoteName = remoteName;
    config.boilerplate = { remoteName };
  }
}

/**
 * Handle customization of diverged commit status options.
 */
export async function handleCustomizeDivergedCommitStatus(): Promise<void> {
  const divergedCommitStatus = await promptDivergedCommitStatusOptions();
  config.log.analyzedFile.commitSummaryState = divergedCommitStatus as NonNullable<typeof config.log.analyzedFile.commitSummaryState>;
}

/**
 * Handle customization of dry run package.json changes option.
 */
export async function handleCustomizePackageJsonMode(): Promise<void> {
  const packageJsonMode = await promptPackageJsonMode();
  config.behavior.packageJsonMode = packageJsonMode;
}

/**
 * Handle customization of skip all pushes option.
 */
export async function handleCustomizeSkipAllPushes(): Promise<void> {
  const skipAllPushes = await promptConfigureSkipAllPushes();
  config.behavior.skipAllPushes = skipAllPushes;
}

/**
 * Handle customization of max git previews for squash commits option.
 */
export async function handleCustomizeMaxGitPreviewsForSquashCommits(): Promise<void> {
  const maxGitPreviewsForSquashCommits = await promptConfigureMaxGitPreviewsForSquashCommits();
  config.behavior.maxGitPreviewsForSquashCommits = maxGitPreviewsForSquashCommits;
}

/**
 * Pass CLI configuration values to the main config on initial load.
 * 
 * @param cliConfig - The CLI configuration object
 */
export function onInitialConfigLoad(cli: CLIConfig) {
  if (cli.syncService) {
    config.syncService = cli.syncService as SyncService;
  }

  if (cli.boilerplateLocation) {
    config.boilerplateLocation = cli.boilerplateLocation as 'local' | 'remote';
  }

  if (cli.boilerplateBranch) {
    config.boilerplate = { branch: cli.boilerplateBranch }
  }

  if (cli.forkLocation) {
    config.forkLocation = cli.forkLocation as 'local' | 'remote';
  }

  if (cli.forkBranch) {
    config.fork = { branch: cli.forkBranch };
  }

  if (cli.forkSyncBranch) {
    config.fork = { syncBranch: cli.forkSyncBranch };
  }
}