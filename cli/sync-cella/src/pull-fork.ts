import yoctoSpinner from 'yocto-spinner';
import colors from 'picocolors';

import { DEFAULT_CONFIG_FILE } from './constants.ts';

import { rename, unlink } from 'node:fs/promises';

import { fetchRemote } from './fetch-remote.ts';
import { runGitCommand } from './utils/run-git-command.ts';

import { extractValues } from './utils/config-file.ts';
import { extractIgnorePatterns, excludeByIgnorePatterns } from './utils/ignore-patterns.ts';

interface Fork {
  name: string;
  branch: string;
  remoteUrl: string;
}

export interface PullForkOptions {
  prBranchName: string;
  fork: Fork;
}

export async function pullFork({
  prBranchName,
  fork,
}: PullForkOptions): Promise<void> {
  const targetFolder = process.cwd();
  console.info();

  // Check for local changes
  const statusSpinner = yoctoSpinner({
    text: 'Checking for local changes that might get lost',
  }).start();

  try {
    const statusOutput = await runGitCommand({ targetFolder, command: 'status --porcelain' });

    if (statusOutput.trim() !== '') {
      statusSpinner.error('Local changes detected. Please commit or stash your changes before proceeding.');
      process.exit(1);
    } else {
      statusSpinner.success('No local changes detected, proceeding.');
    }
  } catch (error) {
    console.error(error);
    statusSpinner.error('Failed to check for local changes.');
    process.exit(1);
  }

  // Step 2: Check out the 'prBranch' locally
  const checkoutSpinner = yoctoSpinner({
    text: `Checking out ${prBranchName} locally`,
  }).start();

  try {
    await runGitCommand({ targetFolder, command: `checkout -b ${prBranchName}` });
    checkoutSpinner.success(`Successfully checked out ${prBranchName}.`);
  } catch (error) {
    if (error instanceof Error && error.message.includes('already exists')) {
      checkoutSpinner.warning(`Branch ${prBranchName} already exists, switching to it.`);
      try {
        await runGitCommand({ targetFolder, command: `checkout ${prBranchName}` });
        checkoutSpinner.success(`Switched to ${prBranchName}.`);
      } catch (err) {
        console.error(err);
        checkoutSpinner.error('Failed to switch to the PR branch.');
        process.exit(1);
      }
    } else {
      console.error(error);
      checkoutSpinner.error('Failed to checkout the PR branch.');
      process.exit(1);
    }
  }

  // Step 3: Fetch fork
  await fetchRemote({ localBranch: prBranchName, remoteUrl: fork.remoteUrl, remoteName: fork.name });

  // Step 4: Retrieve the ignore list from forked repo
  const retrieveSpinner = yoctoSpinner({
    text: `Retrieving ${fork.name}/${fork.branch} ignore list`,
  }).start();

  let ignoreList: string[] = [];

  try {
    // Step 1: Rename the current DEFAULT_CONFIG_FILE to tmp.DEFAULT_CONFIG_FILE
    const originalConfigPath = `${targetFolder}/${DEFAULT_CONFIG_FILE}`;
    const tempConfigPath = `${targetFolder}/tmp.${DEFAULT_CONFIG_FILE}`;

    // Rename the original config file
    await rename(originalConfigPath, tempConfigPath);

    // Step 2: Checkout the forked repo config
    await runGitCommand({ targetFolder, command: `checkout ${fork.name}/${fork.branch} -- ${DEFAULT_CONFIG_FILE}` });

    // Step 3: Extract the ignore list
    const config = await extractValues(DEFAULT_CONFIG_FILE);
    ignoreList = config.ignoreList || [];

    // Step 4: Remove the new DEFAULT_CONFIG_FILE and rename the tmp file back
    await unlink(originalConfigPath); // Optional: Only if you want to remove the newly checked out config
    await rename(tempConfigPath, originalConfigPath);

    // Step 5: Restore git to the original state
    await runGitCommand({ targetFolder, command: `checkout ${DEFAULT_CONFIG_FILE}` });

    retrieveSpinner.success('Successfully retrieved ignore list from forked repo.');
  } catch (error) {
    console.error(error);
    retrieveSpinner.error('Failed to retrieve ignore list from forked repo.');
    process.exit(1);
  }

  // Create and apply ignore patterns
  const ignoreSpinner = yoctoSpinner({
    text: 'Creating ignore patterns',
  }).start();

  const ignorePatterns = await extractIgnorePatterns({ ignoreList });

  if (ignorePatterns.length > 0) {
    ignoreSpinner.success('Successfully created ignore patterns.');
  } else {
    ignoreSpinner.warning('No ignore list found. Proceeding without ignoring files.');
  }

  // Step 5: Merge changes from fork to 'prBranch'
  const mergeSpinner = yoctoSpinner({
    text: `Merging changes from ${fork.name}/${fork.branch} to ${prBranchName}`,
  }).start();

  try {
    // List files from local prBranch and convert the file paths to unique directories
    const localFiles = (await runGitCommand({ targetFolder, command: 'ls-files' })).split('\n').filter(Boolean);
    const filteredLocalFiles = excludeByIgnorePatterns(localFiles, ignorePatterns);

    const uniqueLocalDirs = [...new Set(
      filteredLocalFiles
        .map(file => file.split('/').slice(0, -1).join('/'))
        .filter(dir => dir.includes('/')) // Exclude root-level files
    )];

    // List files from the forked branch and filter them
    const forkedFiles = (await runGitCommand({ targetFolder, command: `ls-tree -r ${fork.name}/${fork.branch} --name-only` })).split('\n').filter(Boolean);
    const filteredForkedFiles = excludeByIgnorePatterns(forkedFiles, ignorePatterns);

    const filesToCheckout = filteredForkedFiles.filter(file => {
      const fileDir = file.split('/').slice(0, -1).join('/');
      return uniqueLocalDirs.includes(fileDir);
    });

    // Checkout all forked files that are in the same directories as the local files
    if (filesToCheckout.length > 0) {
      await runGitCommand({ targetFolder, command: `checkout ${fork.name}/${fork.branch} -- ${filesToCheckout.join(' ')}` });
    }

    mergeSpinner.success(`Successfully merged changes from ${fork.name}/${fork.branch} to ${prBranchName}.`);
  } catch (error) {
    console.error(error);
    mergeSpinner.error('Failed to merge changes from fork to PR branch.');
    process.exit(1);
  }

  console.info(`${colors.green('✔')} Successfully merged changes from ${fork.name}/${fork.branch} to ${prBranchName}, resolving conflicts where necessary.`);
  console.info();
}
