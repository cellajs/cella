import { FileAnalysis, SwizzleEntry } from '../../types/index';

/**
 * Detects if a file has been edited in the fork compared to upstream,
 * indicating a potential "edited" swizzle event.
 * 
 * @param analyzedFile - The analyzed file information.
 * 
 * @returns A SwizzleEntry if the file is detected as edited, otherwise null.
 */
export function detectEditedSwizzle(analyzedFile: FileAnalysis): SwizzleEntry | null {
  const { filePath, commitSummary, blobStatus, upstreamFile, forkFile } = analyzedFile;

  if (blobStatus !== 'different') {
    return null;
  }

  const isEdited = commitSummary?.status === 'ahead' || commitSummary?.status === 'diverged' || commitSummary?.status === 'upToDate';

  if (isEdited) {
    return {
      filePath,
      event: 'edited',
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