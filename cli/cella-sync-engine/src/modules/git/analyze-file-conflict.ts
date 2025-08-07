import { CommitHistorySummary, FileAnalysis } from '../../types';

export function analyzeFileConflict(
  commitStatus: CommitHistorySummary["status"],
  blobStatus: FileAnalysis["blobStatus"]
): { likelihood: FileAnalysis["conflictLikelihood"]; reason: FileAnalysis["conflictReason"] } {
  const isBlobUnknown = blobStatus === 'unknown';
  const isBlobIdentical = blobStatus === 'identical';
  const isBlobDifferent = blobStatus === 'different';

  if (isBlobUnknown) {
    return { likelihood: 'high', reason: 'missingInFork' };
  }

  if (commitStatus === 'upToDate') {
    return {
      likelihood: isBlobIdentical ? 'low' : 'medium',
      reason: isBlobIdentical ? 'none' : 'blobMismatch',
    };
  }

  if (commitStatus === 'unrelated') {
    return { likelihood: 'high', reason: 'unrelatedHistories' };
  }

  if (commitStatus === 'diverged') {
    return {
      likelihood: isBlobDifferent ? 'high' : 'medium',
      reason: 'divergedHistories',
    };
  }

  if (commitStatus === 'ahead') {
    return {
      likelihood: isBlobIdentical ? 'low' : 'medium',
      reason: isBlobIdentical ? 'none' : 'blobMismatch',
    };
  }

  if (commitStatus === 'behind') {
    return {
      likelihood: isBlobIdentical ? 'low' : 'medium',
      reason: isBlobIdentical ? 'none' : 'outdatedInFork',
    };
  }

  return { likelihood: 'medium', reason: 'none' };
}