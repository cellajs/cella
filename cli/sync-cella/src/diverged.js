import { rm, writeFile } from 'node:fs/promises';
import yoctoSpinner from 'yocto-spinner';
import colors from 'picocolors';

import { fetchUpstream } from './fetch-upstream.js'
import { runGitCommand } from './utils/run-git-command.js'
import { extractIgnorePatterns, applyIgnorePatterns } from './utils/ignore-patterns.js'

export async function diverged({
  divergedFile,
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

    commonSpinner.success('Found common files between upstream and local branch.');
  } catch (error) {
    console.error(error);
    commonSpinner.error('Failed to find common files between upstream and local branch.');
    process.exit(1);
  }

  // Spinner for finding diverged files between upstream and local branch
  const divergedSpinner = yoctoSpinner({
    text: 'Finding diverged files between upstream and local branch',
  }).start()

  let divergedFiles;

  try {
    // Get the list of diverged files by comparing local branch and upstream branch
    divergedFiles = await runGitCommand({ targetFolder, command: `diff --name-only ${localBranch} upstream/${upstreamBranch}` });

    divergedSpinner.success('Found diverged files between upstream and local branch.');
  } catch (error) {
    console.error(error);
    divergedSpinner.error('Failed to find diverged files between upstream and local branch.');
    process.exit(1);
  }

  // Create ignored patterns
  const ignoreSpinner = yoctoSpinner({
    text: 'Creating ignore patterns',
  }).start()

  const ignorePatterns = await extractIgnorePatterns({ ignoreList, ignoreFile });
  if (ignorePatterns.length > 0) {
    ignoreSpinner.success('Created ignore patterns.');
  } else {
    ignoreSpinner.warning("No ignore list or ignore file found. Proceeding without ignoring files.");
  }

  const filterSpinnen = yoctoSpinner({
    text: 'Filtering diverged files',
  }).start()

  let filteredFiles = divergedFiles
    .split("\n")
    .filter((file) => commonFiles.includes(file));

  // Filter files using ignore patterns
  if (ignorePatterns.length > 0) {
    filteredFiles = applyIgnorePatterns(filteredFiles, ignorePatterns);
  }
  filterSpinnen.success('Filtered diverged files.');

  const writeSpinner = yoctoSpinner({
    text: 'Writing diverged files to file',
  }).start()

  // Write the final list of diverged files to the specified file
  if (filteredFiles.length > 0) {
    await writeFile(divergedFile, filteredFiles.join("\n"), "utf-8");
    writeSpinner.success(`Diverged files written to ${divergedFile}.`);
  } else {
    writeSpinner.success("No files have diverged between the upstream and local branch that are not ignored.");
    // Optionally remove the Diverged file if empty
    await rm(divergedFile, { force: true });
  }

  console.log()

    // Log each diverged file line by line for clickable paths in VSCode
  filteredFiles.forEach((file) => console.log(`./${file}`));

  console.log()
  console.log(`Found ${colors.blue(filteredFiles.length)} diverged files between the upstream and local branch.`);
  console.log()
  console.log(`${colors.green('✔')} Completed the diverged command.`);
  console.log()
}
