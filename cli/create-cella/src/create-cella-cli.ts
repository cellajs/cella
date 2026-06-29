#!/usr/bin/env tsx

import { existsSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { input, select } from '@inquirer/prompts';
import pc from 'picocolors';
import { TEMPLATE_URL } from '#/constants';
import { create } from '#/create';
import { type CreateOptions, cli, showWelcome } from '#/modules/cli';
import { detectUsedPorts, findNextOffset } from '#/utils/detect-used-ports';
import { extractPackageJsonVersionFromUri } from '#/utils/extract-package-json-version-from-uri';
import { fetchLatestCommit, fetchLatestRelease } from '#/utils/fetch-template-metadata';
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

  // Choose which template snapshot to scaffold from: a stable release or the
  // latest commit. Skipped when a custom --template is provided (ref doesn't apply).
  const templateRef = cli.options.template ? undefined : await promptTemplateRef(promptTheme, promptContext);

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

  // Default to creating a 'development' working branch
  if (!cli.newBranchName) {
    cli.newBranchName = 'development';
  }

  const targetFolder = resolve(cli.directory);
  const projectName = basename(targetFolder)?.toLowerCase() || 'project';

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
  const portOffset = cli.options.portOffset ?? (await promptPortOffset(targetFolder, promptTheme, promptContext));

  // Prompt for admin email
  const adminEmail =
    cli.options.adminEmail ??
    (await input(
      {
        message: 'Admin email for initial seed user',
        default: `admin@${projectName}.com`,
        theme: promptTheme,
      },
      promptContext,
    ));

  // Proceed with the project creation
  const createOptions: CreateOptions = {
    projectName,
    targetFolder,
    newBranchName: cli.newBranchName,
    packageManager: cli.packageManager,
    templateUrl: cli.options.template,
    templateRef,
    portOffset,
    adminEmail,
    skipInstall: cli.options.skipInstall,
  };

  await create(createOptions);
}

main().catch(console.error);

/**
 * Show a short intro with the two starting points (latest release and latest
 * commit, each with its date) and let the user choose which template snapshot to
 * scaffold from. Returns the giget ref (release tag or commit SHA), or undefined
 * to use the default branch (when metadata is unavailable).
 */
async function promptTemplateRef(theme: object, context: object): Promise<string | undefined> {
  const [release, commit] = await Promise.all([fetchLatestRelease(TEMPLATE_URL), fetchLatestCommit(TEMPLATE_URL)]);

  // No metadata (offline / rate-limited) — fall back to the default branch silently.
  if (!release && !commit) return undefined;

  // One-sentence intro followed by the two data points.
  console.info(
    pc.dim("You're about to scaffold a new app from the cella template — pick which snapshot to start from:"),
  );
  if (release) console.info(`  ${pc.cyan('Latest release')}  ${release.tag} ${pc.dim(`· ${release.date}`)}`);
  if (commit) {
    console.info(
      `  ${pc.cyan('Latest commit')}   ${commit.shortSha} ${pc.dim(`· ${commit.message} · ${commit.date}`)}`,
    );
  }
  console.info();

  // Only one available — use it without prompting.
  if (!release) return commit ? commit.sha : undefined;
  if (!commit) return release.tag;

  const choice = await select(
    {
      message: 'Start from',
      theme,
      choices: [
        { name: `Latest release ${pc.dim(`(${release.tag}, stable)`)}`, value: 'release' },
        { name: `Latest commit ${pc.dim(`(${commit.shortSha}, bleeding edge)`)}`, value: 'commit' },
      ],
    },
    context,
  );

  return choice === 'release' ? release.tag : commit.sha;
}

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
