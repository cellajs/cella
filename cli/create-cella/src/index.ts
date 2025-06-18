#!/usr/bin/env tsx

import { existsSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { confirm, input, select } from '@inquirer/prompts';
import colors from 'picocolors';

import { cli } from './cli';
import { AUTHOR, DESCRIPTION, GITHUB, LOGO, TEMPLATE_URL, VERSION, WEBSITE } from './constants.ts';
import { create } from './create.ts';
import { extractPackageJsonVersionFromUri } from './utils/extract-package-json-version-from-uri';
import { isEmptyDirectory } from './utils/is-empty-directory.ts';
import { validateProjectName } from './utils/validate-project-name.ts';

interface CreateOptions {
  projectName: string;
  targetFolder: string;
  newBranchName?: string | null;
  skipInstall: boolean;
  skipGit: boolean;
  skipClean: boolean;
  skipGenerate: boolean;
  packageManager: string;
}

async function main(): Promise<void> {
  console.info(LOGO);

  // Get the latest version of the template
  const templateVersion = await extractPackageJsonVersionFromUri(TEMPLATE_URL);

  // Display CLI version and created by information
  console.info();
  console.info(DESCRIPTION);
  console.info();
  console.info(`Cella version: ${colors.green(templateVersion)}`);
  console.info(`Cli version ${colors.green(VERSION)}`);
  console.info(`Created by ${AUTHOR}`);
  console.info(`${GITHUB} | ${WEBSITE}`);
  console.info();

  // Skip creating a new branch if --skipNewBranch flag is provided or git is skipped
  if (cli.options.skipNewBranch || cli.options.skipGit) {
    cli.createNewBranch = false;
    cli.newBranchName = null;
  }

  // Skip generating sql files if --skipGenerate flag is provided
  if (cli.options.skipGenerate === true) {
    cli.options.skipGenerate = true;
  }

  // Skip installing packages if --skipInstall flag is provided
  if (cli.options.skipInstall === true) {
    cli.options.skipInstall = true;
  }

  // Skip cleaning the template if --skipClean flag is provided
  if (cli.options.skipClean === true) {
    cli.options.skipClean = true;
  }

  // Skip initializing git if --skipGit flag is provided
  if (cli.options.skipGit === true) {
    cli.options.skipGit = true;
  }

  // Prompt for project name if not provided
  if (!cli.directory) {
    cli.directory = await input({
      message: 'Enter your project name',
      default: 'my-cella-app',
      validate: (name) => {
        const validation = validateProjectName(basename(resolve(name)));
        return validation.valid ? true : `Invalid project name: ${validation.problems[0]}`;
      },
    });
  }

  // Prompt to create a new branch besides the main branch (if not skipped)
  if (cli.createNewBranch === null) {
    cli.createNewBranch = await confirm({
      message: 'Would you like to create a new branch (besides "main")?',
      default: true,
    });
  }

  // Prompt for new branch name, only if user opted to create a new branch
  if (!cli.newBranchName && cli.createNewBranch) {
    cli.newBranchName = await input({
      message: 'Enter the new branch name',
      default: 'development',
      validate: (name) => {
        const validation = validateProjectName(basename(resolve(name)));
        return validation.valid ? true : `Invalid branch name: ${validation.problems[0]}`;
      },
    });
  }

  const targetFolder = resolve(cli.directory);
  const projectName = basename(targetFolder);

  // Check if the target folder exists and is not empty
  if (existsSync(targetFolder) && !(await isEmptyDirectory(targetFolder))) {
    const dirName = cli.directory === '.' ? 'Current directory' : `Target directory "${targetFolder}"`;
    const message = `${dirName} is not empty. Please choose how you would like to proceed:`;

    const action = await select({
      message,
      choices: [
        { name: 'Cancel and exit', value: 'cancel' },
        { name: 'Ignore existing files and continue', value: 'ignore' },
      ],
    });

    if (action === 'cancel') {
      process.exit(1);
    }
  }

  // Proceed with the project creation
  const createOptions: CreateOptions = {
    projectName,
    targetFolder,
    newBranchName: cli.newBranchName,
    skipInstall: cli.options.skipInstall,
    skipGit: cli.options.skipGit,
    skipClean: cli.options.skipClean,
    skipGenerate: cli.options.skipGenerate,
    packageManager: cli.packageManager,
  };

  await create(createOptions);
}

main().catch(console.error);
