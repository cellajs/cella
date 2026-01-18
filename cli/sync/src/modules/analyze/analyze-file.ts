/**
 * Analyzes a file by comparing its state in the upstream and fork repositories.
 */
import type { RepoConfig } from '#/config';
import { analyzeFileBlob } from '#/modules/git/analyze-file-blob';
import { analyzeFileCommits } from '#/modules/git/analyze-file-commits';
import { determineFileMergeStrategy } from '#/modules/git/determine-file-merge-strategy';
import { getOverrideStatus } from '#/modules/overrides';
import type { CommitSummary, FileAnalysis, FileEntry } from '#/types';

/**
 * Analyzes a file by comparing its state in the upstream and fork repositories.
 * Optimized to skip expensive commit history comparison when blobs are identical.
 *
 * @param upstream - The upstream repository configuration
 * @param fork - The fork repository configuration
 * @param upstreamFile - The file entry from the upstream repository
 * @param forkFile - The file entry from the fork repository (if it exists)
 * @returns A promise that resolves to the analyzed file data
 */
export async function analyzeFile(
  upstream: RepoConfig,
  fork: RepoConfig,
  upstreamFile: FileEntry,
  forkFile?: FileEntry,
): Promise<FileAnalysis> {
  const filePath = upstreamFile.path;

  // Compute blob status first - it's cheap (no git calls)
  const blobStatus = analyzeFileBlob(upstreamFile, forkFile);

  // Skip expensive commit history comparison if blobs are identical
  // Files with identical content don't need sync regardless of commit history
  let commitSummary: CommitSummary;
  if (blobStatus === 'identical') {
    commitSummary = {
      status: 'upToDate',
      commitsAhead: 0,
      commitsBehind: 0,
      historyCoverage: 'complete',
    };
  } else {
    commitSummary = await analyzeFileCommits(upstream, fork, filePath);
  }

  const analyzedFile: FileAnalysis = {
    filePath,
    upstreamFile,
    forkFile,
    commitSummary,
    blobStatus,
    overrideStatus: getOverrideStatus(filePath),
  };

  analyzedFile.mergeStrategy = determineFileMergeStrategy(analyzedFile);

  return analyzedFile;
}
