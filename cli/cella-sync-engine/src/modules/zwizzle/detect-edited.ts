import { FileAnalysis, ZwizzleEntry } from '../../types/index';

/**
 * Detects if a file has been edited in the fork compared to the boilerplate,
 * indicating a potential "edited" zwizzle event.
 * @param analyzedFile - The analyzed file information.
 * @returns A ZwizzleEntry if the file is detected as edited, otherwise null.
 */
export function detectEditedZwizzle(analyzedFile: FileAnalysis): ZwizzleEntry | null {
  const { filePath, commitSummary, blobStatus, boilerplateFile, forkFile } = analyzedFile;

  if (blobStatus !== 'different') {
    return null;
  }

  const isEdited = commitSummary?.status === 'ahead' || commitSummary?.status === 'diverged' || commitSummary?.status === 'upToDate';

  if (isEdited) {
    return {
      filePath,
      event: 'edited',
      zwizzled: true,
      sharedAncestorSha: commitSummary.sharedAncestorSha,
      lastCommitSha: forkFile?.lastCommitSha,
      commitAfterSwizzle: commitSummary.sharedAncestorSha, // Assuming this is the commit after the swizzle
      lastZwizzledAt: new Date().toISOString(),
      boilerplateLastCommitSha: boilerplateFile.lastCommitSha,
      boilerplateBlobSha: boilerplateFile.blobSha,
    };
  }

  return null;
}