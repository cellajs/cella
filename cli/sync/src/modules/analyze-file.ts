import pLimit from 'p-limit';

import { RepoConfig } from '../config';
import { FileAnalysis, FileEntry } from '../types';
import { analyzeFileBlob } from './git/analyze-file-blob';
import { analyzeFileCommits } from './git/analyze-file-commits';
import { determineFileMergeStrategy } from './git/determine-file-merge-strategy';
import { getOverrideStatus } from './overrides';

// Run 10 analyses at a time
const limit = pLimit(10);

/**
 * Analyzes a file by comparing its state in the upstream and fork repositories.
 *
 * @param upstream - The upstream repository configuration
 * @param fork - The fork repository configuration
 * @param upstreamFile - The file entry from the upstream repository
 * @param forkFile - The file entry from the fork repository (if it exists)
 *
 * @returns A promise that resolves to the analyzed file data
 */
async function analyzeFile(
  upstream: RepoConfig,
  fork: RepoConfig,
  upstreamFile: FileEntry,
  forkFile?: FileEntry,
): Promise<FileAnalysis> {
  const filePath = upstreamFile.path;
  const commitSummary = await analyzeFileCommits(upstream, fork, filePath);
  const blobStatus = analyzeFileBlob(upstreamFile, forkFile);

  // Create the analysis object with override status from config
  const analyzedFile: FileAnalysis = {
    filePath,
    upstreamFile,
    forkFile,
    commitSummary,
    blobStatus,
    overrideStatus: getOverrideStatus(filePath),
  };

  // Determine merge strategy
  analyzedFile.mergeStrategy = determineFileMergeStrategy(analyzedFile);

  return analyzedFile;
}

/**
 * Analyzes multiple files by comparing their states in the upstream and fork repositories.
 *
 * @param upstream - The upstream repository configuration
 * @param fork - The fork repository configuration
 * @param upstreamFiles - The list of file entries from the upstream repository
 * @param forkFiles - The list of file entries from the fork repository
 *
 * @returns A promise that resolves to an array of analyzed file data
 */
export async function analyzeManyFiles(
  upstream: RepoConfig,
  fork: RepoConfig,
  upstreamFiles: FileEntry[],
  forkFiles: FileEntry[],
): Promise<FileAnalysis[]> {
  const forkMap = new Map(forkFiles.map((file) => [file.path, file]));
  const analysisPromises = upstreamFiles.map((upstreamFile) =>
    limit(async () => {
      const forkFile = forkMap.get(upstreamFile.path);
      return analyzeFile(upstream, fork, upstreamFile, forkFile);
    }),
  );

  return Promise.all(analysisPromises);
}
