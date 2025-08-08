import { CommitSummary, FileAnalysis, MergeRisk } from '../../types';

/**
 * Quick analysis of file merge conflict risk based on commit and blob status.
 * 
 * - Filters out files that are safe (low likelihood & git can auto-resolve)
 * - Flags files that need deeper sync-engine analysis.
 * 
 * @param commitStatus - Sync state of commits between boilerplate and fork.
 * @param blobStatus - Blob (file content) comparison result.
 * @returns Merge risk evaluation object.
 */
export function analyzeFileMergeRisk(
  commitStatus: CommitSummary['status'],
  blobStatus: FileAnalysis['blobStatus']
): MergeRisk {

  const isBlobIdentical = blobStatus === 'identical';
  const isBlobDifferent = blobStatus === 'different';
  const isBlobMissing = blobStatus === 'missing';

  if (commitStatus === 'upToDate') {
    if (isBlobIdentical) {
      return {
        likelihood: 'low',
        reason: 'identical',
        safeByGit: true,
        check: 'none'
      };
    }

    // edge case, normally blob is identical if up to date (corrupted?)
    if (isBlobDifferent) {
      return {
        likelihood: 'medium',
        reason: 'blobMismatch',
        safeByGit: false,
        check: 'gitAutoMerge',
      };
    }

    // edge case, normally blob is identical if up to date (corrupted?)
    if (isBlobMissing) {
      return {
        likelihood: 'high',
        reason: 'missingInFork',
        safeByGit: false,
        check: 'addedOrRemoved'
      };
    }
  } 
  
  if (commitStatus === 'ahead' || commitStatus === 'behind') {
    if (isBlobIdentical) {
      return {
        likelihood: 'low',
        reason: 'identical',
        safeByGit: true,
        check: 'none',
      };
    }

    // Common case for ahead/behind, just check blob on shared ancestor
    if (isBlobDifferent) {
      return {
        likelihood: 'medium',
        reason: 'blobMismatch',
        safeByGit: false,
        check: 'verifyAncestor'
      };
    }

    // edge case, normally blob exists if ahead/behind
    if (isBlobMissing) { 
      return {
        likelihood: 'high',
        reason: 'missingInFork',
        safeByGit: false,
        check: 'addedOrRemoved' 
      };
    }
  } 
  
  if (commitStatus === 'diverged') {
    if (isBlobIdentical) {
      return {
        likelihood: 'medium',
        reason: 'identical',
        safeByGit: true,
        check: 'none'
      };
    }
    // If blobs are different, we need to check content and gitAutoMerge
    if (isBlobDifferent || isBlobMissing) {
      return {
        likelihood: 'high',
        reason: 'divergedContent',
        safeByGit: false,
        check: 'threeWayMergeCheck'
      };
    }
  } 
  
  if (commitStatus === 'unrelated') {
    if (isBlobIdentical) {
      return {
        likelihood: 'medium',
        reason: 'unrelatedHistories',
        safeByGit: true,
        check: 'none'
      };
    }

    // If blobs are different, we need to check content and gitAutoMerge
    if (isBlobDifferent || isBlobMissing) {
      return {
        likelihood: 'high',
        reason: 'unrelatedHistories',
        safeByGit: false,
        check: 'threeWayMergeCheck'
      };
    }
  }

  // Fallback safety
  return {
    likelihood: 'high',
    reason: 'unknown',
    safeByGit: false,
    check: 'gitAutoMerge'
  };
}