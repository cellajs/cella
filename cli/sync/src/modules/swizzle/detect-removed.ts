import { FileAnalysis, SwizzleEntry } from '../../types/index';

/**
 * Detects if a file has been removed in the fork but exists in upstream,
 * indicating a potential "removed" swizzle event.
 *
 * @param analyzedFile - The analyzed file information.
 *
 * @returns A SwizzleEntry if the file is detected as removed, otherwise null.
 */
export function detectRemovedSwizzle(analyzedFile: FileAnalysis): SwizzleEntry | null {
  const { filePath, commitSummary, blobStatus, upstreamFile, forkFile } = analyzedFile;

  const isRelated = commitSummary?.status && commitSummary.status !== 'unrelated';
  const isMissing = blobStatus === 'missing';
  const hasUpstream = !!upstreamFile;

  if (isRelated && isMissing && hasUpstream) {
    return {
      filePath,
      event: 'removed',
      swizzled: true,
      sharedAncestorSha: commitSummary.sharedAncestorSha,
      lastCommitSha: forkFile?.lastCommitSha,
      commitAfterSwizzle: commitSummary.sharedAncestorSha, // Assuming this is the commit after the swizzle
      lastSwizzledAt: new Date().toISOString(),
      upstreamLastCommitSha: upstreamFile.lastCommitSha,
      upstreamBlobSha: upstreamFile.blobSha,
    };
  }

  return null;
}
