import yoctoSpinner from 'yocto-spinner';
import colors from 'picocolors';

import { rename, unlink } from 'node:fs/promises';

import { fetchRemote } from './fetch-remote.js';
import { runGitCommand } from './utils/run-git-command.js';

import { extractValues } from './utils/config-file.js';

export async function pullFork({
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

  // Step 4: retrive the ignore list from forked repo
  const retriveSpinner = yoctoSpinner({
    text: `Retriving ${fork.name}/${fork.branch} ignore list`,
  }).start();

  let ignoreList = [];

  try {
    // Step 1: Rename the current cella.config.js to tmp.cella.config.js
    const originalConfigPath = `${targetFolder}/cella.config.js`;
    const tempConfigPath = `${targetFolder}/tmp.cella.config.js`;

    // Rename the original config file
    await rename(originalConfigPath, tempConfigPath);

    // Step 2: Checkout the forked repo config
    await runGitCommand({ targetFolder, command: `checkout ${fork.name}/${fork.branch} -- cella.config.js` });

    // Step 3: Extract the ignore list
    const config = await extractValues('cella.config.js');
    ignoreList = config.ignoreList;

    // Step 4: Remove the new cella.config.js and rename the tmp file back
    await unlink(originalConfigPath); // Optional: Only if you want to remove the newly checked out config
    await rename(tempConfigPath, originalConfigPath);

    retriveSpinner.succeed('Successfully retrieved ignore list from forked repo.');

  } catch (e) {
    console.error(e);
    retriveSpinner.error('Failed to retrive ignore list from forked repo.');
    process.exit(1);
  }

  console.log('ignoreList: ', ignoreList)
  console.info(`${colors.green('✔')} Successfully merged changes from ${fork.name}/${fork.branch} to ${prBranchName}, resolving conflicts where necessary.`);

  process.exit(1);
  // Step 5: Merge changes from fork to 'prBranch'
  const mergeSpinner = yoctoSpinner({
    text: `Merging changes from ${fork.name}/${fork.branch} to ${prBranchName}`,
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
    const forkedFiles = (await runGitCommand({ targetFolder, command: `ls-tree -r ${fork.name}/${fork.branch} --name-only` })).split('\n').filter(Boolean);

    const filesToCheckout = forkedFiles.filter(file => {
      // Check if the file's directory is in `uniqueLocalDirs`
      const fileDir = file.split('/').slice(0, -1).join('/');
      return uniqueLocalDirs.includes(fileDir);
    });

    // Checkout all forked files that are in the same directories as the local files
    if (filesToCheckout.length > 0) {
      await runGitCommand({ targetFolder, command: `checkout ${fork.name}/${fork.branch} -- ${filesToCheckout.join(' ')}` });
    };

    mergeSpinner.success(`Successfully merged changes from ${fork.name}/${fork.branch} to ${prBranchName}.`);
  } catch (e) {
    console.error(e);
    mergeSpinner.error('Failed to merge changes from fork to PR branch.');
    process.exit(1);
  }

  console.info(`${colors.green('✔')} Successfully merged changes from ${fork.name}/${fork.branch} to ${prBranchName}, resolving conflicts where necessary.`);
  console.info();
}
