import yoctoSpinner from 'yocto-spinner';
import colors from 'picocolors';

import { fetchUpstream } from './fetch-upstream.js'
import { runGitCommand } from './utils/run-git-command.js'
import { extractIgnorePatterns, applyIgnorePatterns } from './utils/ignore-patterns.js'

export async function pullUpstream({
  ignoreFile,
  ignoreList,
  upstreamBranch,
  localBranch,
}) {
  const targetFolder = process.cwd()
  console.info();

  // Fetch upstream changes and checkout local branch
  await fetchUpstream({ localBranch });

  // Check if there are local changes
  const statusSpinner = yoctoSpinner({
    text: 'Checking for local changes that might be overridden by the merge',
  }).start()

  // Check for local changes
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
  }).start()

  try {
    await runGitCommand({ targetFolder, command: `merge --no-commit upstream/${upstreamBranch}` });
    mergeSpinner.success(`Successfully merged upstream/${upstreamBranch} into ${localBranch} without committing.`);
  }catch(e) {
    console.error(e)
    mergeSpinner.error('Failed to merge upstream changes without committing.');
    process.exit(1)
  }

  // Create and apply ignore patterns
  const ignoreSpinner = yoctoSpinner({
    text: 'Creating ignore patterns',
  }).start()

  const ignorePatterns = await extractIgnorePatterns({ ignoreList, ignoreFile });

  if (ignorePatterns.length > 0) {
    ignoreSpinner.success('Successfully created ignore patterns.');

    const applyIgnoreSpinner = yoctoSpinner({
      text: 'Applying reset/checkout based on ignoreList or ignoreFile',
    }).start();

    try {
      // Get the list of tracked files and filter them
      const files = (await runGitCommand({ targetFolder, command: 'ls-files' })).split('\n');
      const filteredFiles = applyIgnorePatterns(files, ignorePatterns);

      // Join the list of files into a space-separated string
      const filesToReset = filteredFiles.join(' ');

      // Run the reset and checkout commands with all files at once
      if (filesToReset.length > 0) {
        await runGitCommand({ targetFolder, command: `reset ${filesToReset}` });
        await runGitCommand({ targetFolder, command: `checkout --ours -- ${filesToReset}` });
      }

      applyIgnoreSpinner.success('Successfully applied reset/checkout for ignored files.');
    } catch (e) {
      console.error(e);
      applyIgnoreSpinner.error('Failed to apply reset/checkout.');
      process.exit(1);
    }
  } else {
    ignoreSpinner.warning('No ignore list or ignore file found. Proceeding without ignoring files.');
    console.info(`${colors.yellow('Skipped')} reset/checkout as no files are ignored.`);
  }

  // Check for merge conflicts
  const conflictSpinner = yoctoSpinner({
    text: 'Checking for merge conflicts',
  }).start()

  try {
    const conflicts = await runGitCommand({ targetFolder, command: 'diff --check' });

    if (!conflicts) {
      conflictSpinner.success('No merge conflicts detected, proceeding with commit.');

      // Commit the merge
      const commitSpinner = yoctoSpinner({ 
        text: 'Committing merge' 
      }).start();
      
      try {
        await runGitCommand({ targetFolder, command: 'add .' });
        await runGitCommand({
          targetFolder,
          command: `commit -m "Merged upstream changes, keeping files listed in ${ignoreFile || 'ignoreList'}."`,
        });
        commitSpinner.success('Merge committed successfully.');
      } catch (e) {
        if (!e.includes('nothing to commit, working tree clean')) {
          console.error(e);
          commitSpinner.error('Failed to commit the merge.');
          process.exit(1);
        }
        commitSpinner.success('Nothing to commit, working tree clean.');
      }
    } else {
      conflictSpinner.error('Merge conflicts detected. Resolve conflicts before committing.');
      process.exit(1);
    }
  } catch (e) {
    console.error(e);
    conflictSpinner.error('Failed to check for merge conflicts.');
    process.exit(1);
  }

  console.info(`${colors.green('Success')} Merged upstream changes into local branch ${localBranch}.`);
  console.info()
}