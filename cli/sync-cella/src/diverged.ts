import { rm, writeFile } from 'node:fs/promises';
import yoctoSpinner from 'yocto-spinner';
import colors from 'picocolors';

import { fetchRemote } from './fetch-remote.ts';
import { runGitCommand, getLatestFileCommitInfo } from './utils/run-git-command.ts';
import { extractIgnorePatterns, excludeByIgnorePatterns } from './utils/ignore-patterns.ts';

export interface DivergedOptions {
  divergedFile: string;
  ignoreFile?: string; // Optional
  ignoreList?: string[]; // Optional
  upstreamBranch: string;
  localBranch: string;
}

type DiffStatInfo = {
  statLine: string;
  hash?: string;
  date?: string;
};

export async function diverged({
  divergedFile,
  ignoreFile,
  ignoreList,
  upstreamBranch,
  localBranch,
}: DivergedOptions): Promise<void> {
  const targetFolder = process.cwd();
  console.info();

  // Fetch upstream changes and checkout local branch
  await fetchRemote({ localBranch });

  // Find common files between upstream and local branch
  const commonSpinner = yoctoSpinner({
    text: 'Finding common files between upstream and local branch',
  }).start();

  let commonFiles: string[] = [];

  try {
    // Get the list of tracked files from the upstream branch
    const upstreamFiles = await runGitCommand({
      targetFolder,
      command: `ls-tree -r upstream/${upstreamBranch} --name-only`,
    });

    // Get the list of tracked files from the local branch
    const localFiles = await runGitCommand({
      targetFolder,
      command: `ls-tree -r ${localBranch} --name-only`,
    });

    // Find common files by checking which files are in both lists
    const upstreamFileList = upstreamFiles.split('\n');
    const localFileList = localFiles.split('\n');

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
  }).start();

  let divergedFiles: string = '';
  let divergedDiff: string = '';

  try {
    // Get the list of diverged files by comparing local branch and upstream branch
    divergedFiles = await runGitCommand({
      targetFolder,
      command: `diff --name-only ${localBranch} upstream/${upstreamBranch}`,
    });

    // Get the diff of diverged files (for showing in UI)
    divergedDiff = await runGitCommand({
      targetFolder,
      command: `diff ${localBranch} upstream/${upstreamBranch} --stat=200 --color=always`,
    });

    divergedSpinner.success('Found diverged files between upstream and local branch.');
  } catch (error) {
    console.error(error);
    divergedSpinner.error('Failed to find diverged files between upstream and local branch.');
    process.exit(1);
  }

  // Create ignored patterns
  const ignoreSpinner = yoctoSpinner({
    text: 'Creating ignore patterns',
  }).start();

  const ignorePatterns = await extractIgnorePatterns({ ignoreList, ignoreFile });
  if (ignorePatterns.length > 0) {
    ignoreSpinner.success('Created ignore patterns.');
  } else {
    ignoreSpinner.warning('No ignore list or ignore file found. Proceeding without ignoring files.');
  }

  const filterSpinner = yoctoSpinner({
    text: 'Filtering diverged files',
  }).start();

  let filteredFiles = divergedFiles
    .split('\n')
    .filter((file) => commonFiles.includes(file));

  // Filter files using ignore patterns
  if (ignorePatterns.length > 0) {
    filteredFiles = excludeByIgnorePatterns(filteredFiles, ignorePatterns);
  }
  filterSpinner.success('Filtered diverged files.');

  const writeSpinner = yoctoSpinner({
    text: 'Writing diverged files to file',
  }).start();

  // Write the final list of diverged files to the specified file
  if (filteredFiles.length > 0) {
    await writeFile(divergedFile, filteredFiles.join('\n'), 'utf-8');
    writeSpinner.success(`Diverged files written to ${divergedFile}.`);
  } else {
    writeSpinner.success('No files have diverged between the upstream and local branch that are not ignored.');
    // Optionally remove the diverged file if empty
    await rm(divergedFile, { force: true });
  }

  // Prepare the final output
  const commitInfoSpinner = yoctoSpinner({
    text: 'Processing diverged files...',
  }).start();

  // Split the diff stat output line by line
  const divergedDiffLines = divergedDiff.split('\n');

  // Build a Map: file name => diff stat line
  const diffStatMap = new Map<string, DiffStatInfo>();

  divergedDiffLines.forEach((line) => {
    const fileName = line.split('|')[0]?.trim();

    if (fileName) {
      diffStatMap.set(fileName, {
        statLine: line,
      });
    }
  });

  // Fetch commit info for each file
  const commitInfoPromises = Array.from(diffStatMap.keys()).map(async (fileName) => {
    const { hash, date } = await getLatestFileCommitInfo(targetFolder, fileName);

    const existing = diffStatMap.get(fileName);
    if (existing) {
      diffStatMap.set(fileName, {
        ...existing,
        hash,
        date,
      });
    }
  });

  // Wait for all promises to resolve
  await Promise.all(commitInfoPromises);

  commitInfoSpinner.success('Diverged files processed and commit info fetched.');

  console.info();

  // Log each diverged file line by line for clickable paths in VSCode
  console.info('====================');

  filteredFiles.forEach((file) => {
    const info = diffStatMap.get(file);
  
    if (info) {
      const { statLine, hash, date } = info;
  
      // Colorize the output using picocolors
      const coloredHash = hash ? colors.yellow(hash) : colors.dim('no commits');
      const coloredDate = date ? colors.green(date) : colors.dim('N/A');
  
      console.info(`${statLine}\t(${coloredHash} on ${coloredDate})`);
    } else {
      // Fallback: show clickable file path
      console.info(`./${file}`);
    }
  });
  
  console.info('====================');

  console.info();
  console.info(`Found ${colors.blue(filteredFiles.length.toString())} diverged files between the upstream and local branch.`);
  console.info();
  console.info(`${colors.green('✔')} Completed the diverged command.`);
  console.info();
}
