import { FileAnalysis } from '../../types/index';
import { ZwizzleEntry } from '../../types/zwizzle';

export function detectRemoved(file: FileAnalysis): ZwizzleEntry | null {
  const { commitSummary, blobStatus, boilerplateFile } = file;

  const isAhead = commitSummary?.status === 'ahead';
  const isMissing = blobStatus === 'missing';
  const hasBoilerplate = !!boilerplateFile;

  if (isAhead && isMissing && hasBoilerplate) {
    return {
      filePath: file.filePath,
      event: 'removed',
      swizzled: true,
      sharedAncestorSha: commitSummary.sharedAncestorSha,
      boilerplateBlobSha: boilerplateFile.blobSha,
      commitAfterSwizzle: commitSummary.sharedAncestorSha, // Assuming this is the commit after the swizzle
      detectedAt: new Date().toISOString(),
    };
  }

  return null;
}