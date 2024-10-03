import { rm, writeFile } from 'node:fs/promises';
import yoctoSpinner from 'yocto-spinner';
import colors from 'picocolors';

import { fetchUpstream } from './fetch-upstream.js'
import { runGitCommand } from './utils/run-git-command.js'
import { extractIgnorePatterns, applyIgnorePatterns } from './utils/ignore-patterns.js'

export async function diverged({
  divergentFile,
  ignoreFile,
  ignoreList,
  upstreamBranch,
  localBranch,
}) {
  const targetFolder = process.cwd()
  console.log();

  // Fetch upstream changes and checkout local branch
  await fetchUpstream({ localBranch });

  // Find common files between upstream and local branch
  const commonSpinner = yoctoSpinner({
    text: 'Finding common files between upstream and local branch',
  }).start()
  
  let commonFiles;

  try {
    // Get the list of tracked files from the upstream branch
    const upstreamFiles = await runGitCommand({ targetFolder, command: `ls-tree -r upstream/${upstreamBranch} --name-only` });

    // Get the list of tracked files from the local branch
    const localFiles = await runGitCommand({ targetFolder, command: `ls-tree -r ${localBranch} --name-only` });

    // Find common files by checking which files are in both lists
    const upstreamFileList = upstreamFiles.split("\n");
    const localFileList = localFiles.split("\n");

    commonFiles = upstreamFileList.filter((file) => localFileList.includes(file));

    commonSpinner.success('Successfully found common files between upstream and local branch.');
  } catch (error) {
    console.error(error);
    commonSpinner.error('Failed to find common files between upstream and local branch.');
    process.exit(1);
  }

  // Spinner for finding divergent files between upstream and local branch
  const divergedSpinner = yoctoSpinner({
    text: 'Finding divergent files between upstream and local branch',
  }).start()

  let divergentFiles;

  try {
    // Get the list of divergent files by comparing local branch and upstream branch
    divergentFiles = await runGitCommand({ targetFolder, command: `diff --name-only ${localBranch} upstream/${upstreamBranch}` });

    divergedSpinner.success('Successfully found divergent files between upstream and local branch.');
  } catch (error) {
    console.error(error);
    divergedSpinner.error('Failed to find divergent files between upstream and local branch.');
    process.exit(1);
  }

  // Create ignored patterns
  const ignoreSpinner = yoctoSpinner({
    text: 'Creating ignore patterns',
  }).start()

  const ignorePatterns = await extractIgnorePatterns({ ignoreList, ignoreFile });
  if (ignorePatterns.length > 0) {
    ignoreSpinner.success('Successfully created ignore patterns.');
  } else {
    ignoreSpinner.warning("No ignore list or ignore file found. Proceeding without ignoring files.");
  }

  const filterSpinnen = yoctoSpinner({
    text: 'Filtering divergent files',
  }).start()

  let filteredFiles = divergentFiles
    .split("\n")
    .filter((file) => commonFiles.includes(file));

  // Filter files using ignore patterns
  if (ignorePatterns.length > 0) {
    filteredFiles = applyIgnorePatterns(filteredFiles, ignorePatterns);
  }
  filterSpinnen.success('Successfully filtered divergent files.');

  const writeSpinner = yoctoSpinner({
    text: 'Writing divergent files to file',
  }).start()

  // Write the final list of divergent files to the specified file
  if (filteredFiles.length > 0) {
    await writeFile(divergentFile, filteredFiles.join("\n"), "utf-8");
    writeSpinner.success(`Divergent files successfully written to ${divergentFile}.`);
  } else {
    writeSpinner.success("No files have diverged between the upstream and local branch that are not ignored.");
    // Optionally remove the divergent file if empty
    await rm(divergentFile, { force: true });
  }

  console.log(`${colors.green('Success')} Successfully completed the diverged command.`);
  console.log()
}
