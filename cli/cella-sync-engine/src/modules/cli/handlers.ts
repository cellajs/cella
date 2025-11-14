import pc from "picocolors";

import { CLIConfig } from "./types";
import { config } from "../../config";
import { SyncService } from "../../config/sync-services";
import { promptConfigurationAction, promptSyncService, promptWhichConfigurationToCustomize, type CustomizeOption, type ConfigurationAction, promptConfigureLocation, promptConfigureBranch, promptDivergedCommitStatusOptions, promptConfigureRemoteName  } from "./prompts";
import { AppConfig } from "../../config/types";

/**
 * Handle sync service selection.
 * @param cli - The CLI configuration object
 */
export async function handleSyncService(cli: CLIConfig): Promise<void> {
  if (!cli.syncService) {
    cli.syncService = await promptSyncService();
    config.syncService = cli.syncService as AppConfig['syncService'];
  } else {
    console.info(`Using sync service: ${pc.cyan(`${cli.syncService}\n`)}`);
  }
}

/**
 * Handle further configuration actions.
 * @param cli - The CLI configuration object
 */
export async function handleConfigurationAction(cli: CLIConfig): Promise<void> {
  const configurationState: ConfigurationAction = await promptConfigurationAction();

  if (configurationState === 'continue') {
    return;
  }

  if (configurationState === 'customize') {
    await handleCustomizeConfiguration(cli);
  }
}

/**
 * Handle customization of configuration.
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

  // Recursively handle customization until done
  if (configToCustomize !== 'done') {
    await handleCustomizeConfiguration(cli);
  }
}

/**
 * Handle customization of location.
 * @param cli 
 * @param type 
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
 * @param cli 
 * @param type 
 * @param branchType 
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
 * @param cli 
 * @param type 
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
 * Pass CLI configuration values to the main config on initial load.
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
    config.fork = {  branch: cli.forkBranch  };
  }

  if (cli.forkSyncBranch) {
    config.fork = { syncBranch: cli.forkSyncBranch  };
  }
}