#!/usr/bin/env tsx

import { existsSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { confirm, input, select } from '@inquirer/prompts';
import pc from 'picocolors';

import { TEMPLATE_URL } from '#/constants';
import { create } from '#/create';
import { type CreateOptions, cli, showWelcome } from '#/modules/cli';
import { detectUsedPorts, findNextOffset } from '#/utils/detect-used-ports';
import { extractPackageJsonVersionFromUri } from '#/utils/extract-package-json-version-from-uri';
import { isEmptyDirectory } from '#/utils/is-empty-directory';
import { validateProjectName } from '#/utils/validate-project-name';

async function main(): Promise<void> {
  // Get the latest version of the template
  const templateVersion = await extractPackageJsonVersionFromUri(TEMPLATE_URL);

  // Display CLI welcome banner
  showWelcome(templateVersion);

  // Shared theme to clear prompts after answering
  const promptTheme = { prefix: '', style: { answer: (text: string) => text } };
  const promptContext = { clearPromptOnDone: true };

  // Prompt for project name if not provided
  if (!cli.directory) {
    cli.directory = await input(
      {
        message: 'Enter your project name',
        default: 'my-cella-app',
        theme: promptTheme,
        validate: (name) => {
          const validation = validateProjectName(basename(resolve(name)));
          return validation.valid ? true : `Invalid project name: ${validation.problems?.[0] ?? 'unknown error'}`;
        },
      },
      promptContext,
    );
  }

  // Prompt to create a new branch besides the main branch (if not skipped)
  if (cli.createNewBranch === null) {
    cli.createNewBranch = await confirm(
      {
        message: 'Create a working branch (besides "main")?',
        default: true,
        theme: promptTheme,
      },
      promptContext,
    );
  }

  // Prompt for new branch name, only if user opted to create a new branch
  if (!cli.newBranchName && cli.createNewBranch) {
    cli.newBranchName = await input(
      {
        message: 'Enter working branch name',
        default: 'development',
        theme: promptTheme,
        validate: (name) => {
          const validation = validateProjectName(basename(resolve(name)));
          return validation.valid ? true : `Invalid branch name: ${validation.problems?.[0] ?? 'unknown error'}`;
        },
      },
      promptContext,
    );
  }

  const targetFolder = resolve(cli.directory);
  const projectName = basename(targetFolder);

  // Check if the target folder exists and is not empty
  if (existsSync(targetFolder) && !(await isEmptyDirectory(targetFolder))) {
    const dirName = cli.directory === '.' ? 'Current directory' : `Target directory "${targetFolder}"`;
    const message = `${dirName} is not empty. Please choose how you would like to proceed:`;

    const action = await select(
      {
        message,
        theme: promptTheme,
        choices: [
          { name: 'Cancel and exit', value: 'cancel' },
          { name: 'Ignore existing files and continue', value: 'ignore' },
        ],
      },
      promptContext,
    );

    if (action === 'cancel') {
      process.exit(1);
    }
  }

  // Scan sibling directories and prompt for port offset
  const portOffset = await promptPortOffset(targetFolder, promptTheme, promptContext);

  // Proceed with the project creation
  const createOptions: CreateOptions = {
    projectName,
    targetFolder,
    newBranchName: cli.newBranchName,
    packageManager: cli.packageManager,
    templateUrl: cli.options.template,
    portOffset,
  };

  await create(createOptions);
}

main().catch(console.error);

/** Format an offset as a port overview string, e.g. "10 → :3010 / :4010 / :5442" */
function formatOffset(o: number, suffix = ''): string {
  return `${o} → :${3000 + o} / :${4000 + o} / :${5432 + o}${suffix}`;
}

/** Scan sibling forks and prompt the user to pick a port offset */
async function promptPortOffset(targetFolder: string, theme: object, context: object): Promise<number> {
  const usedPorts = await detectUsedPorts(targetFolder);
  const suggested = findNextOffset(usedPorts);

  if (usedPorts.length > 0) {
    console.info(pc.dim('\nDetected cella forks in sibling directories:'));
    for (const p of usedPorts) {
      console.info(pc.dim(`  ${p.project}: frontend :${p.frontend}, backend :${p.backend} (offset ${p.offset})`));
    }
    console.info();
  }

  const presets = [0, 10, 20, 30].filter((o) => o !== suggested);
  const choice = await select(
    {
      message: 'Port offset (avoids conflicts with sibling forks)',
      theme,
      choices: [
        ...(suggested > 0 ? [{ name: formatOffset(suggested, ' (suggested)'), value: suggested }] : []),
        { name: formatOffset(0, ' (default)'), value: 0 },
        ...presets.map((o) => ({ name: formatOffset(o), value: o })),
        { name: 'Custom offset', value: -1 },
      ],
    },
    context,
  );

  if (choice !== -1) return choice;

  const custom = await input(
    {
      message: 'Enter custom offset (0-490, multiples of 10)',
      default: String(suggested),
      theme,
      validate: (val) => {
        const n = Number(val);
        if (Number.isNaN(n) || n < 0 || n > 490) return 'Must be between 0 and 490';
        if (n % 10 !== 0) return 'Must be a multiple of 10';
        return true;
      },
    },
    context,
  );
  return Number(custom);
}
