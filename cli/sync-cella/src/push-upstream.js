import yoctoSpinner from 'yocto-spinner';
import colors from 'picocolors';

import { fetchUpstream } from './fetch-upstream.js';
import { runGitCommand } from './utils/run-git-command.js';
import { extractIgnorePatterns, applyIgnorePatterns } from './utils/ignore-patterns.js';

export async function pushUpstream({
  ignoreFile,
  ignoreList,
  upstreamBranch,
  localBranch,
  prBranchName,
  prMessage
}) {
  const targetFolder = process.cwd();
  console.info();

  // Step 1: Check for local uncommitted changes
  const statusSpinner = yoctoSpinner({
    text: 'Checking for uncommitted local changes',
  }).start();

  try {
    const statusOutput = await runGitCommand({ targetFolder, command: 'status --porcelain' });
    if (statusOutput.trim() !== '') {
      statusSpinner.error('Uncommitted changes detected. Please commit or stash your changes.');
      process.exit(1);
    } else {
      statusSpinner.success('No uncommitted changes detected.');
    }
  } catch (error) {
    console.error(error);
    statusSpinner.error('Failed to check for local changes.');
    process.exit(1);
  }

  // Step 2: Fetch upstream changes and checkout local branch
  await fetchUpstream({ localBranch });

  // Step 3: Find common files between upstream and local branch
  const commonSpinner = yoctoSpinner({
    text: 'Finding common files between upstream and local branch',
  }).start();

  let commonFiles;

  try {
    const upstreamFiles = await runGitCommand({ targetFolder, command: `ls-tree -r upstream/${upstreamBranch} --name-only` });
    const localFiles = await runGitCommand({ targetFolder, command: `ls-tree -r ${localBranch} --name-only` });

    const upstreamFileList = upstreamFiles.split("\n");
    const localFileList = localFiles.split("\n");

    // Find common files between both branches
    commonFiles = upstreamFileList.filter((file) => localFileList.includes(file));

    commonSpinner.success('Found common files between upstream and local branch.');
  } catch (error) {
    console.error(error);
    commonSpinner.error('Failed to find common files.');
    process.exit(1);
  }

  // Step 4: Get the list of changes in your local branch
  const changesSpinner = yoctoSpinner({
    text: 'Finding changes in your local branch',
  }).start();

  let changedFiles;

  try {
    changedFiles = await runGitCommand({ targetFolder, command: `diff --name-only ${localBranch}` });
    changesSpinner.success('Found changes in your local branch.');
  } catch (error) {
    console.error(error);
    changesSpinner.error('Failed to find changes in your local branch.');
    process.exit(1);
  }

  // Step 5: Filter the changes to only include files that are in the original repo
  const filterSpinner = yoctoSpinner({
    text: 'Filtering changes to only include common files',
  }).start();

  let filteredFiles = changedFiles.split("\n").filter((file) => commonFiles.includes(file));

  if (filteredFiles.length === 0) {
    filterSpinner.error('No relevant changes to push.');
    process.exit(0);
  }

  filterSpinner.success(`Filtered changes: ${filteredFiles.join(', ')}`);

  // Step 6: Apply ignore patterns (if needed)
  const ignoreSpinner = yoctoSpinner({
    text: 'Applying ignore patterns',
  }).start();

  const ignorePatterns = await extractIgnorePatterns({ ignoreList, ignoreFile });
  if (ignorePatterns.length > 0) {
    filteredFiles = applyIgnorePatterns(filteredFiles, ignorePatterns);
    ignoreSpinner.success('Applied ignore patterns.');
  } else {
    ignoreSpinner.warning('No ignore patterns applied.');
  }

  // Step 7: Create a new branch for the PR
  const branchSpinner = yoctoSpinner({
    text: `Creating branch ${prBranchName}`,
  }).start();

  try {
    await runGitCommand({ targetFolder, command: `checkout -b ${prBranchName}` });
    branchSpinner.success(`Created branch ${prBranchName}.`);
  } catch (error) {
    console.error(error);
    branchSpinner.error('Failed to create the branch.');
    process.exit(1);
  }

  // Step 8: Add filtered changes and commit
  const commitSpinner = yoctoSpinner({
    text: 'Adding and committing filtered changes',
  }).start();

  try {
    await runGitCommand({ targetFolder, command: `git add ${filteredFiles.join(' ')}` });
    await runGitCommand({ targetFolder, command: `git commit -m "${prMessage}"` });
    commitSpinner.success('Committed the filtered changes.');
  } catch (error) {
    console.error(error);
    commitSpinner.error('Failed to commit the changes.');
    process.exit(1);
  }

  // Step 9: Push the new branch to your fork
  const pushSpinner = yoctoSpinner({
    text: 'Pushing branch to origin',
  }).start();

  try {
    await runGitCommand({ targetFolder, command: `git push origin ${prBranchName}` });
    pushSpinner.success(`Pushed ${prBranchName} to origin.`);
  } catch (error) {
    console.error(error);
    pushSpinner.error('Failed to push the branch to origin.');
    process.exit(1);
  }

  // Step 10: (Optional) Create a pull request - use GitHub CLI or API
  console.info(`${colors.green('✔')} Successfully pushed filtered changes to ${prBranchName}. You can now create a pull request.`);
}
