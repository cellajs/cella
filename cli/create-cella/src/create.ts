import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { cp, mkdir, rm } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { checkbox } from '@inquirer/prompts';
import { downloadTemplate } from 'giget';
import { addRemote } from '#/add-remote';
import { TEMPLATE_URL } from '#/constants';
import { type CreateOptions, showSuccess } from '#/modules/cli';
import { cleanTemplate } from '#/utils/clean-template';
import { gitAddAll, gitBranch, gitCheckout, gitCommit, gitInit } from '#/utils/git';
import { createProgress, pauseSpinner, resumeSpinner } from '#/utils/progress';
import { generate, install } from '#/utils/run-package-manager-command';
import { scanOptionalModules } from '#/utils/scan-optional-modules';

/** Check if a path is a local directory */
function isLocalPath(path: string): boolean {
  return path.startsWith('/') || path.startsWith('./') || path.startsWith('../');
}

function shouldSkipStep(name: 'install' | 'generate' | 'git' | 'remote'): boolean {
  return process.env[`CREATE_CELLA_SKIP_${name.toUpperCase()}`] === 'true';
}

export async function create({
  projectName,
  targetFolder,
  newBranchName,
  packageManager,
  templateUrl,
  templateRef,
  portOffset,
  adminEmail,
  skipInstall = false,
  silent = false,
}: CreateOptions): Promise<void> {
  // Save the original working directory
  const originalCwd = process.cwd();

  // Use custom template or default
  const template = templateUrl || TEMPLATE_URL;
  const isLocalTemplate = templateUrl && isLocalPath(templateUrl);

  const progress = createProgress('creating project', silent);

  try {
    // Create the target folder
    progress.step('creating project folder');
    await mkdir(targetFolder, { recursive: true });
    process.chdir(targetFolder);

    // Download or copy the template
    if (isLocalTemplate) {
      progress.step('copying local template');
      const sourcePath = resolve(originalCwd, templateUrl);

      // Check if target is inside source (would cause EINVAL)
      if (targetFolder.startsWith(sourcePath)) {
        throw new Error(
          'Cannot create project inside the template directory.\n' +
            `  Run from outside: cd ~ && pnpm create @cellajs/cella ${projectName} --template ${templateUrl}`,
        );
      }

      // Copy only what git would track (respects .gitignore: no build output, no local .env secrets).
      // Falls back to a plain recursive copy when the template isn't a git repo.
      let tracked: string[] = [];
      try {
        tracked = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], {
          cwd: sourcePath,
        })
          .toString()
          .split('\0')
          .filter(Boolean);
      } catch {
        // not a git repo - fall through to recursive copy
      }

      if (tracked.length > 0) {
        for (const rel of tracked) {
          const src = join(sourcePath, rel);
          if (!existsSync(src)) continue; // tracked but deleted in the working tree
          const dest = join(targetFolder, rel);
          await mkdir(dirname(dest), { recursive: true });
          await cp(src, dest);
        }
      } else {
        await cp(sourcePath, targetFolder, {
          recursive: true,
          filter: (src) => !src.includes('node_modules') && !src.includes('.git'),
        });
      }
    } else {
      // Pin to the chosen ref (release tag or commit SHA) when provided.
      const downloadId = templateRef ? `${template}#${templateRef}` : template;
      progress.step(`downloading cella template${templateRef ? ` (${templateRef})` : ''}`);
      await downloadTemplate(downloadId, {
        cwd: process.cwd(),
        dir: targetFolder,
        force: true,
        provider: 'github',
      });
    }

    // Ask which optional modules to keep, then drop deselected paths
    if (!silent) await promptOptionalModules(targetFolder);

    // Clean the template, generate configs
    progress.step('cleaning template');
    const displayName = projectName.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    await cleanTemplate({ targetFolder, projectName, displayName, portOffset, adminEmail });

    // Install dependencies (generate needs installed deps, so --skip-install skips both)
    if (!skipInstall && !shouldSkipStep('install')) {
      progress.step('installing dependencies');
      await install(packageManager);
    }

    // Generate SQL files
    if (!skipInstall && !shouldSkipStep('generate')) {
      progress.step('generating migrations');
      await generate(packageManager);
    }

    // Initialize git repository
    const gitFolderPath = join(targetFolder, '.git');
    if (!shouldSkipStep('git') && !existsSync(gitFolderPath)) {
      progress.step('initializing git');
      await gitInit(targetFolder);
      await gitAddAll(targetFolder);
      await gitCommit(targetFolder, 'Initial commit');

      if (newBranchName) {
        progress.step(`creating branch '${newBranchName}'`);
        await gitBranch(targetFolder, newBranchName);
        await gitCheckout(targetFolder, newBranchName);
      }
    }

    // Add upstream remote
    if (!shouldSkipStep('remote')) {
      progress.step('adding upstream remote');
      await addRemote({ targetFolder, silent: true });
    }

    // Done
    progress.done(`created ${projectName}`);
  } catch (error) {
    progress.fail(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }

  // Check if the working directory needs to be changed
  const needsCd = originalCwd !== targetFolder;
  const relativePath = relative(originalCwd, targetFolder);

  // Display final success message
  showSuccess(projectName, targetFolder, relativePath, needsCd, packageManager);
}

/**
 * Scan the downloaded template for optional modules and let the user deselect them.
 * Deselected modules have their whole folder removed before cleaning. Default keeps
 * everything (parity with previous behavior).
 */
async function promptOptionalModules(targetFolder: string): Promise<void> {
  const modules = await scanOptionalModules(targetFolder);
  if (modules.length === 0) return;

  pauseSpinner();
  const keep = await checkbox({
    message: 'Optional modules to include',
    choices: modules.map((m) => ({ name: `${m.name} — ${m.description}`, value: m.name, checked: true })),
  });
  resumeSpinner();

  const removeFolders = modules.filter((m) => !keep.includes(m.name)).map((m) => m.folder);
  // A module owns `modules/<name>` plus a static asset folder `public/static/<name>` and its
  // route folders: pathless `_<name>` (URL-transparent) or path-based `<name>` (e.g. /auth),
  // under both `routes/_public` and `routes/_app`.
  const extraFolders = modules
    .filter((m) => !keep.includes(m.name))
    .flatMap((m) => [
      `frontend/src/routes/_public/_${m.name}`,
      `frontend/src/routes/_public/${m.name}`,
      `frontend/src/routes/_app/_${m.name}`,
      `frontend/src/routes/_app/${m.name}`,
      `frontend/public/static/${m.name}`,
    ]);
  await Promise.all(
    [...removeFolders, ...extraFolders].map((f) => rm(join(targetFolder, f), { recursive: true, force: true })),
  );
}
