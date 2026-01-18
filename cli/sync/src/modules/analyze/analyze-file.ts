/**
 * Analyzes a file by comparing its state in the upstream and fork repositories.
 */
import type { RepoConfig } from '#/config';
import type { FileAnalysis, FileEntry } from '#/types';
import { analyzeFileBlob } from '#/modules/git/analyze-file-blob';
import { analyzeFileCommits } from '#/modules/git/analyze-file-commits';
import { determineFileMergeStrategy } from '#/modules/git/determine-file-merge-strategy';
import { getOverrideStatus } from '#/modules/overrides';

/**
 * Analyzes a file by comparing its state in the upstream and fork repositories.
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
  const commitSummary = await analyzeFileCommits(upstream, fork, filePath);
  const blobStatus = analyzeFileBlob(upstreamFile, forkFile);

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
