import pc from 'picocolors';
import { config } from './config';
import { analyzedFileLine, logAnalyzedFileLine, shouldLogAnalyzedFileModule } from './log/analyzed-file';
import { analyzedSummaryLines, logAnalyzedSummaryLines, shouldLogAnalyzedSummaryModule } from './log/analyzed-summary';
import { analyzeManyFiles } from './modules/analyze-file';
import { FileAnalysis } from './types';
import { getGitFileHashes } from './utils/git/files';
import { createProgress } from './utils/progress';

/**
 * Executes the complete file analysis workflow for a sync between the upstream and fork.
 *
 * This process includes:
 *
 * **1. Fetching file hashes**
 *    Retrieves the full list of tracked files (via blob SHA hashes) for:
 *    - the upstream repository
 *    - the fork's sync branch
 *
 * **2. Running file-by-file analysis**
 *    Each file is processed to determine:
 *    - commit history differences
 *    - content differences
 *    - override status (from config.overrides.customized/ignored)
 *    - recommended merge strategy
 *
 * **3. Logging (optional, based on config)**
 *    Logs:
 *    - per-file analysis
 *    - final summary
 *
 * This function forms the core engine of the sync process,
 * producing a structured list of `FileAnalysis` objects that
 * downstream sync operations will act upon.
 *
 * @returns A Promise resolving to an array of `FileAnalysis` objects,
 *          one for each analyzed file.
 */
export async function runAnalyze(): Promise<FileAnalysis[]> {
  const progress = createProgress('analyzing files');

  const analyzedFiles = await progress.wrap(async () => {
    progress.step('fetching file list');

    // Fetch file hashes from both upstream and fork repositories in parallel
    const [upstreamFiles, forkFiles] = await Promise.all([
      getGitFileHashes(config.upstream.workingDirectory, config.upstream.branchRef),
      getGitFileHashes(config.fork.workingDirectory, config.fork.syncBranchRef),
    ]);

    progress.step('comparing file histories');

    // Analyze files by comparing upstream and fork file hashes
    const files = await analyzeManyFiles(config.upstream, config.fork, upstreamFiles, forkFiles);

    progress.done(`analyzed ${files.length} files`);
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

  // Log the summary of analyzed files (compact inline format)
  if (shouldLogAnalyzedSummaryModule()) {
    console.info();
    const summaryLines = analyzedSummaryLines(analyzedFiles);
    logAnalyzedSummaryLines(summaryLines);
  }

  return analyzedFiles;
}
