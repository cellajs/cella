import { FileAnalysis, ZwizzleEntry } from '../../types/index';

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