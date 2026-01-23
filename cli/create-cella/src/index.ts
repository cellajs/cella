#!/usr/bin/env tsx

import { existsSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { confirm, input, select } from '@inquirer/prompts';

import { TEMPLATE_URL } from '#/constants';
import { create } from '#/create';
import { type CreateOptions, cli, showWelcome } from '#/modules/cli';
import { extractPackageJsonVersionFromUri } from '#/utils/extract-package-json-version-from-uri';
import { isEmptyDirectory } from '#/utils/is-empty-directory';
import { validateProjectName } from '#/utils/validate-project-name';

async function main(): Promise<void> {
  // Get the latest version of the template
  const templateVersion = await extractPackageJsonVersionFromUri(TEMPLATE_URL);

  // Display CLI welcome banner
  showWelcome(templateVersion);

  // Skip creating a new branch if --skipNewBranch flag is provided or git is skipped
  if (cli.options.skipNewBranch || cli.options.skipGit) {
    cli.createNewBranch = false;
    cli.newBranchName = null;
  }

  // Prompt for project name if not provided
  if (!cli.directory) {
    cli.directory = await input({
      message: 'Enter your project name',
      default: 'my-cella-app',
      validate: (name) => {
        const validation = validateProjectName(basename(resolve(name)));
        return validation.valid ? true : `Invalid project name: ${validation.problems?.[0] ?? 'unknown error'}`;
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
        return validation.valid ? true : `Invalid branch name: ${validation.problems?.[0] ?? 'unknown error'}`;
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
