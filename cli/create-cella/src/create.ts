import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { cp, mkdir } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { downloadTemplate } from 'giget';
import { addRemote } from '#/add-remote';
import { TEMPLATE_URL } from '#/constants';
import { type CreateOptions, showSuccess } from '#/modules/cli';
import { cleanTemplate } from '#/utils/clean-template';
import { gitAddAll, gitBranch, gitCheckout, gitCommit, gitInit } from '#/utils/git';
import { createProgress } from '#/utils/progress';
import { generate, install } from '#/utils/run-package-manager-command';

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
      progress.step('downloading cella template');
      await downloadTemplate(template, {
        cwd: process.cwd(),
        dir: targetFolder,
        force: true,
        provider: 'github',
      });
    }

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
