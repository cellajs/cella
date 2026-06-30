#!/usr/bin/env tsx

import { existsSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { input, select } from '@inquirer/prompts';
import pc from 'picocolors';
import { TEMPLATE_URL } from '#/constants';
import { create } from '#/create';
import { type CreateOptions, cli, confirmChoice, showWelcome } from '#/modules/cli';
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
  confirmChoice('Port offset', formatOffset(portOffset));

  // Prompt for admin email. Default uses the reserved `example.com` domain (RFC 2606) so the
  // seed address can never resolve or route real mail — it's a placeholder, not a real inbox.
  const adminEmail =
    cli.options.adminEmail ??
    (await input(
      {
        message: 'Admin email for initial seed user',
        default: 'admin@example.com',
        theme: promptTheme,
      },
      promptContext,
    ));
  confirmChoice('Admin email', adminEmail);

  // Proceed with the project creation
  const createOptions: CreateOptions = {
    projectName,
    targetFolder,
    packageManager: cli.packageManager,
    templateUrl: cli.options.template,
    templateRef,
    portOffset,
    adminEmail,
    skipInstall: cli.options.skipInstall,
  };

  await create(createOptions);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

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
  console.info(pc.dim('You are about to install the Cella template.'));
  console.info();

  if (release) console.info(`  Latest release:  ${release.tag} ${pc.dim(`· ${release.date}`)}`);
  if (commit) {
    console.info(`  Latest commit:  ${commit.shortSha} ${pc.dim(`· ${commit.message} · ${commit.date}`)}`);
    // Clickable link to the exact commit on GitHub, in grey below the summary line.
    const repo = TEMPLATE_URL.replace('github:', '');
    console.info(`  ${pc.gray(`https://github.com/${repo}/commit/${commit.sha}`)}`);
  }
  console.info();

  // Only one available — use it without prompting.
  if (!release) return commit?.sha;
  if (!commit) return release.tag;

  const choice = await select(
    {
      message: 'Start from',
      theme,
      choices: [
        { name: 'Latest release', value: 'release' },
        { name: 'Latest commit', value: 'commit' },
      ],
    },
    context,
  );

  // The prompt clears itself on done, so keep the choice visible with a checkmark.
  if (choice === 'release') {
    confirmChoice('Latest release', release.tag);
    return release.tag;
  }
  confirmChoice('Latest commit', commit.shortSha);
  return commit.sha;
}

/** Format an offset as a port overview string, e.g. "10 → :3010 / :4010 / :5442" */
function formatOffset(o: number, suffix = ''): string {
  return `${o} → :${3000 + o} / :${4000 + o} / :${5432 + o}${suffix}`;
}

/** Scan sibling forks and prompt the user to pick a port offset */
async function promptPortOffset(targetFolder: string, theme: object, context: object): Promise<number> {
  const usedPorts = await detectUsedPorts(targetFolder);
  const suggested = findNextOffset(usedPorts);

  // Fold a compact hint into the prompt message itself so it's wiped by clearPromptOnDone
  // once an offset is chosen — no leftover "Detected forks" trail. Override the default
  // message style (which bolds everything) so only the "Port offset" title is bold.
  let message = `${pc.bold('Port offset')} ${pc.dim('· to avoid conflicts with other forks/clones')}`;
  if (usedPorts.length > 0) {
    const count = usedPorts.length;
    message += pc.dim(`\nDetected ${count} sibling fork${count === 1 ? '' : 's'} · suggested offset ${suggested}`);
  }
  const portTheme = {
    ...(theme as Record<string, unknown>),
    style: { ...((theme as { style?: object }).style ?? {}), message: (text: string) => text },
  };

  // Presets exclude 0 (always offered as the explicit default below) and the suggested
  // value (offered first) to avoid duplicate choices.
  const presets = [10, 20, 30].filter((o) => o !== suggested);
  const choice = await select(
    {
      message,
      theme: portTheme,
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
