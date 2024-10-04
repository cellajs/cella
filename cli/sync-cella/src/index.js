#!/usr/bin/env node

import { resolve } from 'node:path'
import { existsSync } from 'node:fs'

import { input, confirm, select } from '@inquirer/prompts';
import fileSelector from 'inquirer-file-selector'

import { cli } from './cli.js'
import { CELLA_TITLE, DEFAULT_CONFIG_FILE, DEFAULT_DIVERGED_FILE, DEFAULT_UPSTREAM_BRANCH } from './constants.js'

import { extractValues } from './utils/config-file.js'
import { runGitCommand } from './utils/run-git-command.js'

import { diverged } from './diverged.js'
import { mergeUpstream } from './merge-upstream.js'

async function main() {
  console.log(CELLA_TITLE);

  const targetFolder = process.cwd()

  // Ask for sync service if not provided
  if (!cli.syncService) {
    cli.syncService = await select({
      message: 'Select the sync service you want to use:',
      choices: [
        { name: 'Diverged files', value: 'diverged' },
        { name: 'Merge upstream', value: 'merge-upstream' },
        { name: 'Cancel', value: 'cancel' },
      ],
    })

    if (cli.syncService === 'cancel') {
      process.exit(1)
    }
  }

  // Ask for the config file and extract the values
  const { problems, selectedFile, divergedFile, ignoreFile, ignoreList, upstreamBranch } = await askForConfigFile(cli.configFile)

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

  // Ask for the upstream branch if not provided
  if (!cli.upstreamBranch) {
    cli.upstreamBranch = await input({
      message: 'Enter the name of the upstream branch:',
      default: DEFAULT_UPSTREAM_BRANCH,
    })
  }

  // Ask for the diverged file if not provided
  if (!cli.divergedFile) {
    cli.divergedFile = await input({
      message: 'Enter the path for the diverged file:',
      default: DEFAULT_DIVERGED_FILE,
    })
  }

  // Check if the current branch is provided, and ask if user wants to proceed
  if (!cli.localBranch) {
    cli.localBranch = await runGitCommand({ targetFolder, command: 'rev-parse --abbrev-ref HEAD' })

    const proceed = await confirm({
      message: `You are currently on branch "${cli.localBranch}". Do you want to proceed?`,
      default: true,
    })

    if (!proceed) {
      process.exit(1)
    }
  }

  // Run the selected sync service and pass the options
  const options = {
    divergedFile: cli.divergedFile,
    ignoreFile: cli.ignoreFile,
    ignoreList: cli.ignoreList,
    upstreamBranch: cli.upstreamBranch,
    localBranch: cli.localBranch,
  };

  if (cli.syncService === 'diverged') {
    return await diverged(options);
  }

  if (cli.syncService === 'merge-upstream') {
    return await mergeUpstream(options);
  }
}

async function askForConfigFile(configFile) {
  if (configFile) {
    return await extractValues(cli.configFile);
  }

  let selectedFile = '';

  // Check if default config file exists, and ask if user wants to use it
  const defaultConfigFile = resolve(DEFAULT_CONFIG_FILE);
  let useDefaultConfig = false;

  if (existsSync(defaultConfigFile)) {
    useDefaultConfig = await confirm({
      message: `Do you want to use "${defaultConfigFile}" as your config file?`,
      default: true,
    })
  }
  
  // If user wants to use default config file, set it
  if (useDefaultConfig) {
    selectedFile = defaultConfigFile;
  }

  if (!selectedFile) {
    // Ask if user wants to use the file selector
    const useFileSelector = await confirm({
      message: 'Do you want to use the file selector?',
      default: true,
    })
    
    // If user wants to use the file selector, ask for the file
    if (useFileSelector) {
      selectedFile = await fileSelector({
        message: 'Select a file:',
        match: (file) => ['.js', '.json', '.ts'].some(ext => file.name.endsWith(ext)),
        allowCancel: true,
      });
    } else {
      selectedFile = await input({
        message: 'Enter the path to the config file:',
        default: DEFAULT_CONFIG_FILE,
        validate: (file) => {
          const configFile = resolve(file)
    
          if (!file) {
            return 'Config file is required.'
          }
          
          if (!existsSync(configFile)) {
            return `Config file: "${configFile}" not found.`
          }
          return true;
        },
      })
    }
  }

  // Extract the values from the selected file
  if (selectedFile && selectedFile !== 'canceled') {
    const { problems, divergedFile, ignoreFile, ignoreList, upstreamBranch } = await extractValues(selectedFile);

    if (problems) {
      console.error('Invalid config file: ' + problems[0]);
      return await askForConfigFile();
    }

    return { selectedFile, divergedFile, ignoreFile, ignoreList, upstreamBranch }; 
  } else {
    return await askForConfigFile(); 
  }
}

main().catch(console.error)