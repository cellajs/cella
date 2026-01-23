import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { downloadTemplate } from 'giget';
import { addRemote } from '#/add-remote';
import { TEMPLATE_URL } from '#/constants';
import { type CreateOptions, showSkipWarning, showSuccess } from '#/modules/cli';
import { cleanTemplate } from '#/utils/clean-template';
import { gitAddAll, gitBranch, gitCheckout, gitCommit, gitInit } from '#/utils/git';
import { createProgress } from '#/utils/progress';
import { generate, install } from '#/utils/run-package-manager-command';

export async function create({
  projectName,
  targetFolder,
  newBranchName,
  skipInstall,
  skipGit,
  skipClean,
  skipGenerate,
  packageManager,
}: CreateOptions): Promise<void> {
  // Save the original working directory
  const originalCwd = process.cwd();

  const progress = createProgress('creating project');

  try {
    // Create the target folder
    progress.step('creating project folder');
    await mkdir(targetFolder, { recursive: true });
    process.chdir(targetFolder);

    // Download the template
    progress.step('downloading cella template');
    await downloadTemplate(TEMPLATE_URL, {
      cwd: process.cwd(),
      dir: targetFolder,
      force: true,
      provider: 'github',
    });

    // Clean the template
    if (!skipClean) {
      progress.step('cleaning template');
      await cleanTemplate({ targetFolder });
    }

    // Install dependencies
    if (!skipInstall) {
      progress.step('installing dependencies');
      await install(packageManager);
    }

    // Generate SQL files
    if (!skipGenerate) {
      progress.step('generating migrations');
      await generate(packageManager);
    }

    // Initialize git repository
    if (!skipGit) {
      const gitFolderPath = join(targetFolder, '.git');

      if (!existsSync(gitFolderPath)) {
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
    }

    // Add upstream remote
    progress.step('adding upstream remote');
    await addRemote({ targetFolder, silent: true });

    // Done
    progress.done(`created ${projectName}`);
  } catch (error) {
    progress.fail(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }

  // Show skipped steps as warnings
  if (skipClean) showSkipWarning('--skip-clean', 'template not cleaned');
  if (skipInstall) showSkipWarning('--skip-install', 'dependencies not installed');
  if (skipGenerate) showSkipWarning('--skip-generate', 'migrations not generated');
  if (skipGit) showSkipWarning('--skip-git', 'git not initialized');

  // Check if the working directory needs to be changed
  const needsCd = originalCwd !== targetFolder;
  const relativePath = relative(originalCwd, targetFolder);

  // Display final success message
  showSuccess(projectName, targetFolder, relativePath, needsCd, packageManager);
}
