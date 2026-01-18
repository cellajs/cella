/**
 * Analyze module - File analysis for sync between upstream and fork.
 * Exports the main runAnalyze function and supporting utilities.
 */

import pLimit from 'p-limit';
import pc from 'picocolors';
import { config } from '#/config';
import { FileAnalysis, FileEntry } from '#/types';
import { gitLatestCommit, gitMergeBase } from '#/utils/git/command';
import { getGitFileHashes } from '#/utils/git/files';
import { createProgress } from '#/utils/progress';
import { analyzeFile } from './analyze-file';
import { analyzedFileLine, logAnalyzedFileLine, shouldLogAnalyzedFileModule } from './log-file';
import { analyzedSummaryLines, logAnalyzedSummaryLines, shouldLogAnalyzedSummaryModule } from './log-summary';

// Re-export log utilities for external use
export { analyzedFileLine, logAnalyzedFileLine, shouldLogAnalyzedFileModule } from './log-file';
export { analyzedSummaryLines, logAnalyzedSummaryLines, shouldLogAnalyzedSummaryModule } from './log-summary';

// Run 10 analyses at a time
const limit = pLimit(10);

/**
 * Logs branch-level sync state showing upstream HEAD, sync-branch HEAD, and their merge-base.
 * Only shown in verbose/debug mode.
 */
async function logBranchSyncState(): Promise<void> {
  if (!config.verbose && !config.debug) return;

  const workDir = config.workingDirectory;
  const upstreamRef = config.upstreamBranchRef;
  const syncRef = config.forkSyncBranchRef;

  const [upstreamCommit, syncCommit, mergeBase] = await Promise.all([
    gitLatestCommit(workDir, upstreamRef),
    gitLatestCommit(workDir, syncRef),
    gitMergeBase(workDir, upstreamRef, syncRef),
  ]);

  console.info(pc.bold('\nbranch sync state:'));

  if (upstreamCommit) {
    console.info(`  ${pc.cyan('upstream')} ${pc.dim(`(${upstreamRef})`)}`);
    console.info(`    ${pc.yellow(upstreamCommit.shortSha)} ${pc.dim(upstreamCommit.date)} ${upstreamCommit.message}`);
  }

  if (syncCommit) {
    console.info(`  ${pc.cyan('sync-branch')} ${pc.dim(`(${syncRef})`)}`);
    console.info(`    ${pc.yellow(syncCommit.shortSha)} ${pc.dim(syncCommit.date)} ${syncCommit.message}`);
  }

  if (mergeBase) {
    const shortBase = mergeBase.slice(0, 7);
    const isUpToDate = upstreamCommit?.sha === mergeBase;
    const status = isUpToDate ? pc.green('✓ up to date') : pc.yellow('⟳ commits to sync');
    console.info(`  ${pc.cyan('merge-base')} ${pc.yellow(shortBase)} ${status}`);
  } else {
    console.info(`  ${pc.cyan('merge-base')} ${pc.red('none (unrelated histories)')}`);
  }
}

/**
 * Analyzes multiple files by comparing their states in the upstream and fork repositories.
 */
async function analyzeManyFiles(upstreamFiles: FileEntry[], forkFiles: FileEntry[]): Promise<FileAnalysis[]> {
  const forkMap = new Map(forkFiles.map((file) => [file.path, file]));
  const analysisPromises = upstreamFiles.map((upstreamFile) =>
    limit(async () => {
      const forkFile = forkMap.get(upstreamFile.path);
      return analyzeFile(config.upstream, config.fork, upstreamFile, forkFile);
    }),
  );

  return Promise.all(analysisPromises);
}

/**
 * Executes the complete file analysis workflow for a sync between the upstream and fork.
 *
 * This process includes:
 * 1. Fetching file hashes from upstream and fork
 * 2. Running file-by-file analysis (commit history, content diffs, merge strategies)
 * 3. Logging results based on config
 *
 * @returns A Promise resolving to an array of FileAnalysis objects.
 */
export async function runAnalyze(): Promise<FileAnalysis[]> {
  const progress = createProgress('analyzing files');

  const analyzedFiles = await progress.wrap(async () => {
    progress.step('fetching file list');

    const [upstreamFiles, forkFiles] = await Promise.all([
      getGitFileHashes(config.workingDirectory, config.upstreamBranchRef),
      getGitFileHashes(config.workingDirectory, config.forkSyncBranchRef),
    ]);

    progress.step('comparing file histories');

    const files = await analyzeManyFiles(upstreamFiles, forkFiles);

    progress.done(`analysis finished`);
    return files;
  });

  // Log the analyzed files
  if (shouldLogAnalyzedFileModule()) {
    console.info(pc.bold('\nfile analysis:'));
    for (const file of analyzedFiles) {
      const line = analyzedFileLine(file);
      logAnalyzedFileLine(file, line);
    }
  }

  // Log the summary of analyzed files
  if (shouldLogAnalyzedSummaryModule()) {
    console.info();
    const summaryLines = analyzedSummaryLines(analyzedFiles);
    logAnalyzedSummaryLines(summaryLines);
  }

  // Log branch sync state in verbose mode
  await logBranchSyncState();

  return analyzedFiles;
}
