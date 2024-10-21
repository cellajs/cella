import { existsSync } from 'node:fs';
import yoctoSpinner from 'yocto-spinner';
import colors from 'picocolors';
import { confirm } from '@inquirer/prompts';

import { fetchUpstream } from './fetch-upstream.js';
import { runGitCommand } from './utils/run-git-command.js';
import { extractIgnorePatterns, applyIgnorePatterns } from './utils/ignore-patterns.js';

export async function pushUpstream({
  ignoreFile,
  ignoreList,
  upstreamBranch,
  localBranch,
  prBranchName,
}) {
  const targetFolder = process.cwd();

  // Step 1: Check for unstaged changes
  const statusSpinner = yoctoSpinner({
    text: 'Checking for unstaged changes',
  }).start();

  let hasUnstagedChanges = false;
  try {
    const statusOutput = await runGitCommand({ targetFolder, command: 'status --porcelain' });
    
    if (statusOutput.trim() !== '') {
      hasUnstagedChanges = true;
    }

    statusSpinner.success('Checked for unstaged changes.');
  } catch (error) {
    console.error(error);
    statusSpinner.error('Failed to check for unstaged changes.');
    process.exit(1);
  }

  // If there are unstaged changes, ask the user how to proceed
  if (hasUnstagedChanges) {
    const shouldStashChanges = await confirm({
      message: 'You have unstaged changes. Do you want to stash them and proceed?',
      default: true,
    });

    if (shouldStashChanges) {
      const stashSpinner = yoctoSpinner({
        text: 'Stashing changes',
      }).start();

      try {
        await runGitCommand({ targetFolder, command: 'stash' });
        stashSpinner.success('Successfully stashed changes.');
      } catch (error) {
        console.error(error);
        stashSpinner.error('Failed to stash changes.');
        process.exit(1);
      }
    } else {
      console.info('Please commit or stash your changes before proceeding.');
      process.exit(1);
    }
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

  // Step 3: Fetch upstream changes and continue the process
  await fetchUpstream({ localBranch });

  // Continue with the rest of your steps as before
  // Step 4: Find common files between upstream and local branch
  const commonSpinner = yoctoSpinner({
    text: 'Finding common files between upstream and local branch',
  }).start();

  let commonFiles;

  try {
    const upstreamFiles = await runGitCommand({ targetFolder, command: `ls-tree -r upstream/${upstreamBranch} --name-only` });
    const localFiles = await runGitCommand({ targetFolder, command: `ls-tree -r ${localBranch} --name-only` });

    const upstreamFileList = upstreamFiles.split("\n");
    const localFileList = localFiles.split("\n");

    // Find common files
    commonFiles = upstreamFileList.filter((file) => localFileList.includes(file));

    commonSpinner.success('Found common files between upstream and local branch.');
  } catch (error) {
    console.error(error);
    commonSpinner.error('Failed to find common files.');
    process.exit(1);
  }

  // Step 5: Merge the local branch into the upstream branch
  const mergeSpinner = yoctoSpinner({
    text: `Merging ${localBranch} into upstream/${upstreamBranch}`,
  }).start();

  let mergeOutput;
  try {
    mergeOutput = await runGitCommand({ targetFolder, command: `merge --no-commit upstream/${upstreamBranch}` });

    if (mergeOutput.includes('CONFLICT')) {
      mergeSpinner.warning('Merge conflicts detected. Proceeding to resolve conflicts.');
    } else {
      mergeSpinner.success(`Successfully merged ${localBranch} into upstream/${upstreamBranch}.`);
    }
  } catch (error) {
    if (error.includes('CONFLICT')) {
      mergeSpinner.warning('Merge conflicts detected. Proceeding to resolve conflicts.');
    } else {
      console.error(error);
      mergeSpinner.error('Failed to merge branches.');
      process.exit(1);
    }
  }

  // Step 6: Filter and revert ignored files
  const filterSpinner = yoctoSpinner({
    text: 'Filtering and reverting ignored files',
  }).start();

  let filteredFiles;
  try {
    const divergedFiles = await runGitCommand({ targetFolder, command: `diff --name-only ${localBranch} upstream/${upstreamBranch}` });

    // Split diverged files into an array
    filteredFiles = divergedFiles.split("\n").filter((file) => commonFiles.includes(file));

    // Extract ignore patterns and apply them
    const ignorePatterns = await extractIgnorePatterns({ ignoreList, ignoreFile });
    if (ignorePatterns.length > 0) {
      const ignoredFiles = applyIgnorePatterns(filteredFiles, ignorePatterns);

      if (ignoredFiles.length > 0) {
        // Ensure the files exist before attempting to reset or checkout
        const existingFilesToRevert = ignoredFiles.filter(file => existsSync(file)).join(' ');

        if (existingFilesToRevert.length > 0) {
          await runGitCommand({ targetFolder, command: `reset ${existingFilesToRevert}` });
          await runGitCommand({ targetFolder, command: `checkout --ours -- ${existingFilesToRevert}` });

          // Remove the ignored files from the filtered list
          filteredFiles = filteredFiles.filter((file) => !ignoredFiles.includes(file));
        }
      }
    }

    filterSpinner.success('Filtered and reverted ignored files.');
  } catch (error) {
    console.error(error);
    filterSpinner.error('Failed to filter and revert ignored files.');
    process.exit(1);
  }

  // Step 7: Stage and commit only filtered files
  const commitSpinner = yoctoSpinner({
    text: 'Staging and committing filtered files',
  }).start();

  try {
    if (filteredFiles.length > 0) {
      await runGitCommand({ targetFolder, command: `add ${filteredFiles.join(' ')}` });
      await runGitCommand({ targetFolder, command: `commit -m "Merge from ${localBranch} to upstream/${upstreamBranch}, resolving conflicts for ignored files"` });

      commitSpinner.success('Committed the filtered files.');
    } else {
      commitSpinner.success('No files to commit.');
    }
  } catch (error) {
    console.error(error);
    commitSpinner.error('Failed to commit the filtered files.');
    process.exit(1);
  }

  // Step 8: Push the merged changes back to the original repo
  const pushSpinner = yoctoSpinner({
    text: 'Pushing changes to upstream',
  }).start();

  try {
    await runGitCommand({ targetFolder, command: `push origin ${prBranchName}` });
    pushSpinner.success('Pushed changes to upstream.');
  } catch (error) {
    console.error(error);
    pushSpinner.error('Failed to push changes.');
    process.exit(1);
  }

  console.info(`${colors.green('✔')} Successfully merged changes from ${localBranch} to upstream/${upstreamBranch}, resolving conflicts where necessary.`);
  console.info();
}
