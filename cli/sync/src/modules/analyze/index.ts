/**
 * Analyze module - File analysis for sync between upstream and fork.
 * Exports the main runAnalyze function and supporting utilities.
 */
import pc from 'picocolors';
import { config } from '#/config';
import { FileAnalysis, FileEntry } from '#/types';
import { getGitFileHashes } from '#/utils/git/files';
import { createProgress } from '#/utils/progress';
import { analyzeFile } from './analyze-file';
import { analyzedFileLine, logAnalyzedFileLine, shouldLogAnalyzedFileModule } from './log-file';
import { analyzedSummaryLines, logAnalyzedSummaryLines, shouldLogAnalyzedSummaryModule } from './log-summary';
import pLimit from 'p-limit';

// Re-export log utilities for external use
export { analyzedFileLine, logAnalyzedFileLine, shouldLogAnalyzedFileModule } from './log-file';
export { analyzedSummaryLines, logAnalyzedSummaryLines, shouldLogAnalyzedSummaryModule } from './log-summary';

// Run 10 analyses at a time
const limit = pLimit(10);

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
      getGitFileHashes(config.upstream.workingDirectory, config.upstream.branchRef),
      getGitFileHashes(config.fork.workingDirectory, config.fork.syncBranchRef),
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

  return analyzedFiles;
}
