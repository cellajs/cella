import { FileAnalysis, ZwizzleEntry } from '../../types/index';

/**
 * Detects if a file has been removed in the fork but exists in the boilerplate,
 * indicating a potential "removed" zwizzle event.
 * 
 * @param analyzedFile - The analyzed file information.
 * @returns A ZwizzleEntry if the file is detected as removed, otherwise null.
 */
export function detectRemovedZwizzle(analyzedFile: FileAnalysis): ZwizzleEntry | null {
  const { filePath, commitSummary, blobStatus, boilerplateFile, forkFile } = analyzedFile;

  const isRelated = commitSummary?.status && commitSummary.status !== 'unrelated'
  const isMissing = blobStatus === 'missing';
  const hasBoilerplate = !!boilerplateFile;

  if (isRelated && isMissing && hasBoilerplate) {
    return {
      filePath,
      event: 'removed',
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