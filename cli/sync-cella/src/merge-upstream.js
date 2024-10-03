import yoctoSpinner from 'yocto-spinner';
import colors from 'picocolors';

import { fetchUpstream } from './fetch-upstream.js'
import { runGitCommand } from './utils/run-git-command.js'
import { extractIgnorePatterns, applyIgnorePatterns } from './utils/ignore-patterns.js'

export async function mergeUpstream({
  ignoreFile,
  ignoreList,
  upstreamBranch,
  localBranch,
}) {
  const targetFolder = process.cwd()
  console.log();

  // Fetch upstream changes and checkout local branch
  await fetchUpstream({ localBranch });

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

      // Reset and checkout the filtered files
      for (const file of filteredFiles) {
        await runGitCommand({ targetFolder, command: `reset ${file}` });
        await runGitCommand({ targetFolder, command: `checkout --ours -- ${file}` });
      }

      applyIgnoreSpinner.success('Successfully applied reset/checkout for ignored files.');
    } catch (e) {
      console.error(e);
      applyIgnoreSpinner.error('Failed to apply reset/checkout.');
      process.exit(1);
    }
  } else {
    ignoreSpinner.warning('No ignore list or ignore file found. Proceeding without ignoring files.');
    console.log(`${colors.yellow('Skipped')} reset/checkout as no files are ignored.`);
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

  console.log(`${colors.green('Success')} Merged upstream changes into local branch ${localBranch}.`);
  console.log()
}