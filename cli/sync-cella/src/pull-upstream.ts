import yoctoSpinner from 'yocto-spinner';
import colors from 'picocolors';

import { fetchRemote } from './fetch-remote.ts';
import { runGitCommand } from './utils/run-git-command.ts';
import { extractIgnorePatterns, pickByIgnorePatterns } from './utils/ignore-patterns.ts';

export interface PullUpstreamOptions {
  ignoreFile?: string; // Optional path to an ignore file
  ignoreList?: string[]; // Optional array of ignore patterns
  upstreamBranch: string; // Name of the upstream branch to merge from
  localBranch: string; // Name of the local branch to merge into
}

export async function pullUpstream({
  ignoreFile,
  ignoreList,
  upstreamBranch,
  localBranch,
}: PullUpstreamOptions): Promise<void> {
  const targetFolder = process.cwd();
  console.info();

  // Fetch upstream changes and checkout local branch
  await fetchRemote({ localBranch });

  // Check for local changes
  const statusSpinner = yoctoSpinner({
    text: 'Checking for local changes that might be overridden by the merge',
  }).start();

  try {
    const statusOutput = await runGitCommand({ targetFolder, command: 'status --porcelain' });

    if (statusOutput.trim() !== '') {
      statusSpinner.error('Local changes detected. Please commit or stash your changes before merging.');
      process.exit(1);
    } else {
      statusSpinner.success('No local changes detected, proceeding with merge.');
    }
  } catch (error) {
    console.error(error);
    statusSpinner.error('Failed to check for local changes.');
    process.exit(1);
  }

  // Merge upstream changes without committing
  const mergeSpinner = yoctoSpinner({
    text: `Merging upstream/${upstreamBranch} changes into ${localBranch} without committing`,
  }).start();

  try {
    await runGitCommand({ targetFolder, command: `merge --no-commit upstream/${upstreamBranch}` });
    mergeSpinner.success(`Successfully merged upstream/${upstreamBranch} into ${localBranch} without committing.`);
  } catch (error) {
    console.error(error);
    mergeSpinner.error('Failed to merge upstream changes without committing.');
    process.exit(1);
  }

  // Create and apply ignore patterns
  const ignoreSpinner = yoctoSpinner({
    text: 'Creating ignore patterns',
  }).start();

  const ignorePatterns = await extractIgnorePatterns({ ignoreList, ignoreFile });

  if (ignorePatterns.length > 0) {
    ignoreSpinner.success('Successfully created ignore patterns.');

    const applyIgnoreSpinner = yoctoSpinner({
      text: 'Cleaning files based on ignoreList or ignoreFile',
    }).start();

    try {
      // Get, filter, and reset tracked files
      const trackedFiles = (await runGitCommand({ targetFolder, command: 'ls-files' })).split('\n').filter(Boolean);
      const ignoredTrackedFiles = pickByIgnorePatterns(trackedFiles, ignorePatterns);

      if (ignoredTrackedFiles.length > 0) {
        await runGitCommand({ targetFolder, command: `reset ${ignoredTrackedFiles.join(' ')}` });
      }

      // Get, filter, and checkout tracked files after reset
      const filesAfterReset = (await runGitCommand({ targetFolder, command: 'ls-files' })).split('\n').filter(Boolean);
      const filesToCheckout = pickByIgnorePatterns(filesAfterReset, ignorePatterns);

      if (filesToCheckout.length > 0) {
        await runGitCommand({ targetFolder, command: `checkout --ours -- ${filesToCheckout.join(' ')}` });
      }

      // Get, filter, and remove untracked files
      const untrackedFiles = (await runGitCommand({ targetFolder, command: 'ls-files --others --exclude-standard' })).split('\n').filter(Boolean);
      const ignoredUntrackedFiles = pickByIgnorePatterns(untrackedFiles, ignorePatterns);

      if (ignoredUntrackedFiles.length > 0) {
        await runGitCommand({ targetFolder, command: `clean -f -x -- ${ignoredUntrackedFiles.join(' ')}` });
      }

      applyIgnoreSpinner.success('Successfully cleaned ignored files.');
    } catch (error) {
      console.error(error);
      applyIgnoreSpinner.error('Failed to clean ignored files.');
      process.exit(1);
    }
  } else {
    ignoreSpinner.warning('No ignore list or ignore file found. Proceeding without ignoring files.');
    console.info(`${colors.yellow('Skipped')} Cleaning ignored files because none were ignored.`);
  }

  // Check for merge conflicts
  const conflictSpinner = yoctoSpinner({
    text: 'Checking for merge conflicts',
  }).start();

  try {
    const conflicts = await runGitCommand({ targetFolder, command: 'diff --check' });

    if (!conflicts) {
      conflictSpinner.success('No merge conflicts detected, proceeding with commit.');

      // Commit the merge
      const commitSpinner = yoctoSpinner({
        text: 'Committing merge',
      }).start();

      try {
        await runGitCommand({ targetFolder, command: 'add .' });
        await runGitCommand({
          targetFolder,
          command: `commit -m "Merged upstream changes, keeping files listed in ${ignoreFile || 'ignoreList'}."`,
        });
        commitSpinner.success('Merge committed successfully.');
      } catch (error) {
        if (!(error instanceof Error) || !error.message.includes('nothing to commit, working tree clean')) {
          console.error(error);
          commitSpinner.error('Failed to commit the merge.');
          process.exit(1);
        }
        commitSpinner.success('Nothing to commit, working tree clean.');
      }
    } else {
      conflictSpinner.error('Merge conflicts detected. Resolve conflicts before committing.');
      process.exit(1);
    }
  } catch (error) {
    console.error(error);
    conflictSpinner.error('Failed to check for merge conflicts.');
    process.exit(1);
  }

  console.info(`${colors.green('Success')} Merged upstream changes into local branch ${localBranch}.`);
  console.info();
}
