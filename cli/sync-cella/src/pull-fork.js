import yoctoSpinner from 'yocto-spinner';
import colors from 'picocolors';

import { fetchRemote } from './fetch-remote.js';
import { runGitCommand } from './utils/run-git-command.js';

export async function pullFork({
  ignoreFile,
  ignoreList,
  upstreamBranch,
  localBranch,
  prBranchName,
  fork,
}) {
  const targetFolder = process.cwd();
  console.info();

  // Check for local changes
  const statusSpinner = yoctoSpinner({
    text: 'Checking for local changes that might get lost',
  }).start()

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
    if (error.includes('already exists')) {
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

  console.info(`${colors.green('✔')} Successfully merged changes from ${fork.remoteUrl}/${fork.name} to ${prBranchName}, resolving conflicts where necessary.`);
  console.info();
}
