import { FileAnalysis, ZwizzleEntry } from '../../types/index';

export function detectEditedZwizzle(analyzedFile: FileAnalysis): ZwizzleEntry | null {
  const { filePath, commitSummary, blobStatus, boilerplateFile, forkFile } = analyzedFile;

  const isEdited = commitSummary?.status && (commitSummary.status === 'ahead' || commitSummary.status === 'diverged');
  const isMissing = blobStatus === 'missing';
  const hasBoilerplate = !!boilerplateFile;

  if (isEdited && !isMissing && hasBoilerplate) {
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