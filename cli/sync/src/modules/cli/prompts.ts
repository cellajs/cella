import pc from "picocolors";

import { checkbox, input, select, Separator } from "@inquirer/prompts";
import { SYNC_SERVICE_OPTIONS, SyncService, SERVICES_RUNNING_FROM_LOCAL_FORK } from "../../config/sync-services";
import { config } from "../../config";
import { ConfigurationAction, CustomizeOption } from "./types";

/**
 * Prompt the user to select a sync service.
 */
export async function promptSyncService(): Promise<SyncService> {
  const syncService = await select<string>({
    message: 'Select the sync service you want to use:',
    choices: [
      ...SYNC_SERVICE_OPTIONS,
      new Separator(),
      { name: pc.red('Exit'), value: 'exit' },
    ],
  });

  if (syncService === 'exit') {
    process.exit(1);
  }

  return syncService as SyncService;
}


/**
 * Prompt the user for configuration action.
 */
export async function promptConfigurationAction(): Promise<ConfigurationAction> {
  const configurationState = await select<string>({
    message: 'What do you want to do next?',
    choices: [
      { name: 'continue', value: 'continue' },
      { name: 'Customize configuration', value: 'customize' },
      new Separator(),
      { name: pc.red('Exit'), value: 'exit' },
    ],
  });

  if (configurationState === 'exit') {
    process.exit(1);
  }

  return configurationState as ConfigurationAction;
}

/**
 * Prompt the user to select which configuration to customize.
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

      ...(config.syncService === 'packages' ? [
        new Separator('Packages:'),
        { name: `Run GIT push: <${pc.bold(config.behavior.skipAllPushes ? 'No' : 'Yes')}>`, value: 'skipAllPushes' },
        { name: `Package.json changes: <${pc.bold(config.behavior.packageJsonMode === 'dryRun' ? 'Dry run (only log)' : 'Apply Changes (write, commit)')}>`, value: 'packageJsonMode' },
      ] : []),

      ...(['boilerplate-fork', 'boilerplate-fork+packages'].includes(config.syncService) ? [
        new Separator('Boilerplate-Fork+Packages:'),
        { name: `Run GIT push: <${pc.bold(config.behavior.skipAllPushes ? 'No' : 'Yes')}>`, value: 'skipAllPushes' },
        { name: `Squash - max preview commits: <${pc.bold(config.behavior.maxGitPreviewsForSquashCommits)}>`, value: 'maxGitPreviewsForSquashCommits' },
      ] : []),

      new Separator(),
      { name: 'Done', value: 'done' },
    ],
  });

  return configToCustomize as CustomizeOption;
}

/**
 * Prompt the user to configure location (local or remote).
 */
export async function promptConfigureLocation(type: 'boilerplate' | 'fork'): Promise<'local' | 'remote'> {
  const location = await select<string>({
    message: `Select the ${type} location:`,
    default: type === 'boilerplate' ? config.boilerplate.location : config.fork.location,
    choices: [
      { name: 'Local', value: 'local' },
      { name: 'Remote', value: 'remote', disabled: type === 'fork' && SERVICES_RUNNING_FROM_LOCAL_FORK.includes(config.syncService) },
    ],
  });

  return location as 'local' | 'remote';
}

/**
 * Prompt the user to configure package.json mode (dry run or apply changes).
 */
export async function promptPackageJsonMode(): Promise<'dryRun' | 'applyChanges'> {
  const mode = await select<string>({
    message: `What mode do you want for package.json changes?`,
    default: config.behavior.packageJsonMode,
    choices: [
      { name: 'Dry run (only log)', value: 'dryRun' },
      { name: 'Apply Changes (write, commit)', value: 'applyChanges' },
    ],
  });

  return mode as 'dryRun' | 'applyChanges';
}

/**
 * Prompt the user to configure branch name.
 * 
 * @param type - The repository type of the branch to customize ('boilerplate' or 'fork')
 * @param branchType - The specific branch type to customize ('branch' or 'syncBranch')
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
 * 
 * @param type - The repository type of the remote name to customize ('boilerplate' or 'fork')
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

/**
 * Prompt the user to configure max git previews for squash commits.
 */
export async function promptConfigureMaxGitPreviewsForSquashCommits(): Promise<number> {
  const inputValue = await input({ message: `Enter max git previews for squash commits (current: ${config.behavior.maxGitPreviewsForSquashCommits}):` });
  const parsedValue = parseInt(inputValue, 10);
  if (isNaN(parsedValue) || parsedValue < 1) {
    console.error(pc.red('x Error:'), `Please enter a valid positive number.`);
    return promptConfigureMaxGitPreviewsForSquashCommits();
  }
  return parsedValue;
}

/**
 * Prompt the user to configure skip all pushes option.
 */
export async function promptConfigureSkipAllPushes(): Promise<boolean> {
  const runGitPush = await select<string>({
    message: `Run GIT push?`,
    default: config.behavior.skipAllPushes ? 'no' : 'yes',
    choices: [
      { name: 'Yes', value: 'yes' },
      { name: 'No', value: 'no' },
    ],
  });

  // Skip all pushes (i.e., do not run git push) if the user selects 'no'
  return runGitPush === 'no';
}