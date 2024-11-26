import { resolve } from 'node:path';
import { existsSync } from 'node:fs';

import { input, confirm, select } from '@inquirer/prompts';
import fileSelector from 'inquirer-file-selector';

import { cli } from './cli.ts';
import { CELLA_TITLE, DEFAULT_CONFIG_FILE, DEFAULT_DIVERGED_FILE, DEFAULT_UPSTREAM_BRANCH } from './constants.ts';

import { extractValues, Config, Fork } from './utils/config-file.ts';
import { runGitCommand } from './utils/run-git-command.ts';

import { diverged, DivergedOptions } from './diverged.ts';

import { pullUpstream } from './pull-upstream.js';
import { pullFork } from './pull-fork.js';

interface CliOptions {
  divergedFile?: string;
  ignoreFile?: string;
  ignoreList?: string[];
  upstreamBranch?: string;
  localBranch?: string;
  prBranchName?: string;
  fork?: Fork;
}

async function main(): Promise<void> {
  console.info(CELLA_TITLE);

  const targetFolder = process.cwd();

  if (!cli.syncService) {
    cli.syncService = await select<string>({
      message: 'Select the sync service you want to use:',
      choices: [
        { name: 'Diverged files', value: 'diverged' },
        { name: 'Pull from upstream', value: 'pull-upstream' },
        { name: 'Pull from fork', value: 'pull-fork' },
        { name: 'Cancel', value: 'cancel' },
      ],
    });

    if (cli.syncService === 'cancel') {
      process.exit(1);
    }
  }

  const {
    problems,
    selectedFile,
    divergedFile,
    ignoreFile,
    ignoreList,
    upstreamBranch,
    forks,
  } = await askForConfigFile(cli.configFile);

  if (problems) {
    console.error('Invalid config file: ' + problems[0]);
    process.exit(1);
  }

  if (selectedFile) {
    cli.configFile = selectedFile;
  }

  if (divergedFile) {
    cli.divergedFile = divergedFile;
  }

  if (ignoreFile) {
    cli.ignoreFile = ignoreFile;
  }

  if (ignoreList) {
    cli.ignoreList = ignoreList;
  }

  if (upstreamBranch) {
    cli.upstreamBranch = upstreamBranch;
  }

  if (forks?.length === 1) {
    cli.fork = forks[0];
  }

  if (!cli.upstreamBranch) {
    cli.upstreamBranch = await input({
      message: 'Enter the name of the upstream branch:',
      default: DEFAULT_UPSTREAM_BRANCH,
    });
  }

  if (!cli.divergedFile) {
    cli.divergedFile = await input({
      message: 'Enter the path for the diverged file:',
      default: DEFAULT_DIVERGED_FILE,
    });
  }

  if (!cli.localBranch) {
    cli.localBranch = await runGitCommand({ targetFolder, command: 'rev-parse --abbrev-ref HEAD' });
    const proceed = await confirm({
      message: `You are currently on branch "${cli.localBranch}". Do you want to proceed?`,
      default: true,
    });
    if (!proceed) process.exit(1);
  }

  if (cli.syncService === 'pull-fork') {
    const defaultPrBranchName = `pr-branch-${Date.now()}`;
    cli.prBranchName = await input({
      message: 'Enter the PR branch name:',
      default: defaultPrBranchName,
      validate: (input) => input.length > 0 || 'PR branch name cannot be empty.',
    });

    if (!cli.fork) {
      if (!forks.length) {
        console.error('No valid forks found in the config file.');
        process.exit(1);
      }
      cli.fork = await select<Fork>({
        message: 'Select the fork you want to pull from:',
        choices: forks.map((fork) => ({ name: fork.name, value: fork })),
      });
    } else {
      const proceed = await confirm({
        message: `Currently selected fork "${cli.fork.name}" with remote URL "${cli.fork.remoteUrl}" and branch "${cli.fork.branch}". Do you want to proceed?`,
        default: true,
      });
      if (!proceed) process.exit(1);
    }
  }
  
  if (cli.syncService === 'diverged') {
    const options: DivergedOptions = {
        divergedFile: cli.divergedFile,
        ignoreFile: cli.ignoreFile,
        ignoreList: cli.ignoreList,
        upstreamBranch: cli.upstreamBranch,
        localBranch: cli.localBranch,
    };
    return await diverged(options);
  } else {
    const options: CliOptions = {
        divergedFile: cli.divergedFile,
        ignoreFile: cli.ignoreFile,
        ignoreList: cli.ignoreList,
        upstreamBranch: cli.upstreamBranch,
        localBranch: cli.localBranch,
        prBranchName: cli.prBranchName,
        fork: cli.fork,
    };

    if (cli.syncService === 'pull-upstream') return await pullUpstream(options);
    if (cli.syncService === 'pull-fork') return await pullFork(options);
  }
}

async function askForConfigFile(configFile?: string): Promise<Config & { selectedFile?: string }> {
  if (configFile) return await extractValues(configFile);

  let selectedFile = '';
  const defaultConfigFile = resolve(DEFAULT_CONFIG_FILE);

  if (existsSync(defaultConfigFile)) {
    const useDefaultConfig = await confirm({
      message: `Do you want to use "${defaultConfigFile}" as your config file?`,
      default: true,
    });
    if (useDefaultConfig) selectedFile = defaultConfigFile;
  }

  if (!selectedFile) {
    const useFileSelector = await confirm({
      message: 'Do you want to use the file selector?',
      default: true,
    });

    if (useFileSelector) {
      selectedFile = await fileSelector({
        message: 'Select a file:',
        match: (file) => ['.js', '.json', '.ts'].some((ext) => file.name.endsWith(ext)),
        allowCancel: true,
      });
    } else {
      selectedFile = await input({
        message: 'Enter the path to the config file:',
        default: DEFAULT_CONFIG_FILE,
        validate: (file) => {
          const resolvedFile = resolve(file);
          if (!file) return 'Config file is required.';
          if (!existsSync(resolvedFile)) return `Config file: "${resolvedFile}" not found.`;
          return true;
        },
      });
    }
  }

  if (selectedFile && selectedFile !== 'canceled') {
    const extracted = await extractValues(selectedFile);
    if (extracted.problems) {
      console.error('Invalid config file: ' + extracted.problems[0]);
      return await askForConfigFile();
    }
    return { ...extracted, selectedFile };
  } else {
    return await askForConfigFile();
  }
}

main().catch(console.error);
