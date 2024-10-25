import yoctoSpinner from 'yocto-spinner';
import colors from 'picocolors';

import { fetchRemote } from './fetch-remote.js';
import { runGitCommand } from './utils/run-git-command.js';

import { extractValues } from './utils/config-file.js';

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

  // Step 4: Merge changes from fork to 'prBranch'
  const mergeSpinner = yoctoSpinner({
    text: `Merging changes from ${fork.remoteUrl}/${fork.name} to ${prBranchName}`,
  }).start();

  try {
    // List files from local prBranch and convert the file paths to unique directories
    const localFiles = (await runGitCommand({ targetFolder, command: 'ls-files' })).split('\n').filter(Boolean);
    
    const uniqueLocalDirs = [...new Set(localFiles
      .map(file => {
        const parts = file.split('/');
        parts.pop(); // Remove the last part (the file name) to get the directory path
        return parts.join('/');
      })
      .filter(dir => dir.includes('/')) // Exclude root-level files (those without any directory level)
    )];
    // List files from the forked branch and filter `forkedFiles` to include only files in directories from `uniqueLocalDirs`
    const forkedFiles = (await runGitCommand({ targetFolder, command: 'ls-tree -r ${fork.remoteUrl}/${fork.name} --name-only' })).split('\n').filter(Boolean);

    const filesToCheckout = forkedFiles.filter(file => {
      // Check if the file's directory is in `uniqueLocalDirs`
      const fileDir = file.split('/').slice(0, -1).join('/');
      return uniqueLocalDirs.includes(fileDir);
    });

    // Checkout all forked files that are in the same directories as the local files
    if (filesToCheckout.length > 0) {
      await runGitCommand({ targetFolder, command: `checkout ${fork.remoteUrl}/${fork.name} -- ${filesToCheckout.join(' ')}` });
    };

    mergeSpinner.success(`Successfully merged changes from ${fork.remoteUrl}/${fork.name} to ${prBranchName}.`);
  } catch (e) {
    console.error(e);
    mergeSpinner.error('Failed to merge changes from fork to PR branch.');
    process.exit(1);
  }

  console.info(`${colors.green('✔')} Successfully merged changes from ${fork.remoteUrl}/${fork.name} to ${prBranchName}, resolving conflicts where necessary.`);
  console.info();
}
