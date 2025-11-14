import pc from "picocolors";

import { checkbox, input, select, Separator } from "@inquirer/prompts";
import { SYNC_SERVICE_OPTIONS, SyncService } from "../../config/sync-services";
import { config } from "../../config";

export type ConfigurationAction = 'continue' | 'customize';
export type CustomizeOption =
  | 'boilerplateLocation'
  | 'boilerplateBranch'
  | 'boilerplateRemoteName'
  | 'divergedCommitStatus'
  | 'forkLocation'
  | 'forkBranch'
  | 'forkSyncBranch'
  | 'done';

/**
 * Prompt the user to select a sync service.
 * @returns 
 */
export async function promptSyncService(): Promise<SyncService> {
  const syncService = await select<string>({
    message: 'Select the sync service you want to use:',
    choices: [
      ...SYNC_SERVICE_OPTIONS,
      new Separator(),
      { name: 'Exit', value: 'exit' },
    ],
  });

  if (syncService === 'exit') {
    process.exit(1);
  }

  return syncService as SyncService;
}


/**
 * Prompt the user for configuration action.
 * @returns 
 */
export async function promptConfigurationAction(): Promise<ConfigurationAction> {
  const configurationState = await select<string>({
    message: 'What do you want to do next?',
    choices: [
      { name: 'continue', value: 'continue' },
      { name: 'Customize configuration', value: 'customize' },
      new Separator(),
      { name: 'Exit', value: 'exit' },
    ],
  });

  if (configurationState === 'exit') {
    process.exit(1);
  }

  return configurationState as ConfigurationAction;
}

/**
 * Prompt the user to select which configuration to customize.
 * @returns 
 */
export async function promptWhichConfigurationToCustomize(): Promise<CustomizeOption> {
  const configToCustomize = await select<string>({
    message: 'Select the configuration you want to customize:',
    pageSize: 15,
    choices: [
      new Separator('Boilerplate:'),
      { name: `Boilerplate location: ${pc.bold(`✓ ${config.boilerplate.location}`)}`, value: 'boilerplateLocation' },
      { name: `Boilerplate branch: <${pc.bold(config.boilerplate.branch)}>`, value: 'boilerplateBranch' },
      { name: `Boilerplate remote name: <${pc.bold(config.boilerplate.remoteName)}>`, value: 'boilerplateRemoteName' },

      new Separator('Fork:'),
      { name: `Fork location: ${pc.bold(`✓ ${config.fork.location}`)}`, value: 'forkLocation' },
      { name: `Fork branch: <${pc.bold(config.fork.branch)}>`, value: 'forkBranch' },
      { name: `Fork sync branch: <${pc.bold(config.fork.syncBranch)}>`, value: 'forkSyncBranch' },

      ...(config.syncService === 'diverged' ? [
        new Separator('Diverged:'),
        { name: `Commit status: (${(config.log.analyzedFile.commitSummaryState || []).join(', ')})`, value: 'divergedCommitStatus' },
      ] : []),

      new Separator(),
      { name: 'Done', value: 'done' },
    ],
  });

  return configToCustomize as CustomizeOption;
}

/**
 * Prompt the user to configure location (local or remote).
 * @returns 
 */
export async function promptConfigureLocation(type: 'boilerplate' | 'fork'): Promise<'local' | 'remote'> {
  const location = await select<string>({
    message: `Select the ${type} location:`,
    default: type === 'boilerplate' ? config.boilerplate.location : config.fork.location,
    choices: [
      { name: 'Local', value: 'local' },
      { name: 'Remote', value: 'remote' },
    ],
  });

  return location as 'local' | 'remote';
}

/**
 * Prompt the user to configure branch name.
 * @param branchType 
 * @returns 
 */
export async function promptConfigureBranch(type: 'boilerplate' | 'fork', branchType: 'branch' | 'syncBranch'): Promise<string> {
  const branch = await input({ message: `Enter ${type} ${branchType}:` });
  if (!branch || branch.trim() === '') {
    console.error(pc.red('x Error:'), `${type} ${branchType} name cannot be empty.`);
    return promptConfigureBranch(type, branchType);
  }
  return branch;
}

/**
 * Prompt the user to configure remote name.
 * @returns 
 */
export async function promptConfigureRemoteName(type: 'boilerplate' | 'fork'): Promise<string> {
  const remoteName = await input({ message: `Enter ${type} remote name:` });
  if (!remoteName || remoteName.trim() === '') {
    console.error(pc.red('x Error:'), `${type} Remote name cannot be empty.`);
    return promptConfigureRemoteName(type);
  }
  return remoteName;
}

/**
 * Prompt the user to select diverged commit status options.
 * @returns 
 */
export async function promptDivergedCommitStatusOptions(): Promise<string[]> {
  const options = ['upToDate', 'ahead', 'behind', 'diverged', 'unrelated', 'unknown'];

  const divergedCommitStatus = await checkbox<string>({
    message: 'Which status do you want to include?',
    choices: options.map(status => ({
      name: status,
      value: status,
      checked: (config.log.analyzedFile.commitSummaryState || []).includes(status as any),
    })),
  });

  return divergedCommitStatus;
}