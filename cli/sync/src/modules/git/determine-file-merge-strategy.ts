import { FileAnalysis, FileMergeStrategy } from '#/types';

/**
 * Determines the most appropriate merge strategy for a given file,
 * based on commit history, blob comparisons, and override settings.
 *
 * @param fileAnalysis - Precomputed analysis object for a single file,
 *   containing commit history, blob status, and optional override status.
 *
 * @returns A {@link FileMergeStrategy} object indicating which merge
 *   action to take (e.g., "keep-fork", "remove-from-fork", "manual").
 */
export function determineFileMergeStrategy(fileAnalysis: FileAnalysis): FileMergeStrategy {
  // Extract override flags from config
  const isCustomized = fileAnalysis.overrideStatus === 'customized';
  const isIgnored = fileAnalysis.overrideStatus === 'ignored';

  // 1. Flagged as ignored in settings → remove
  if (isIgnored) {
    return {
      strategy: 'remove-from-fork',
      reason: 'Flagged as ignored in settings',
    };
  }

  const { upstreamFile, forkFile, blobStatus, commitSummary } = fileAnalysis;
  const commitStatus = commitSummary?.status || 'unrelated';
  const isHeadIdentical = upstreamFile.lastCommitSha === forkFile?.lastCommitSha;

  // 2. Commit heads identical → trivial keep
  if (isHeadIdentical) {
    return {
      strategy: 'keep-fork',
      reason: 'Commit HEADs identical',
    };
  }

  // 3. Blobs identical → trivial keep
  if (blobStatus === 'identical') {
    return {
      strategy: 'keep-fork',
      reason: 'Blobs identical',
    };
  }

  // 4. When fork is up-to-date or ahead → assume resolved in fork
  if (commitStatus === 'upToDate' || commitStatus === 'ahead') {
    if (blobStatus === 'different') {
      return {
        strategy: 'keep-fork',
        reason: `Blob differs but history is ${commitStatus}`,
      };
    }
    if (blobStatus === 'missing') {
      return {
        strategy: 'remove-from-fork',
        reason: `Blob missing but history is ${commitStatus}`,
      };
    }
  }

  // 5. When fork is behind upstream → usually keep upstream
  if (commitStatus === 'behind') {
    if (blobStatus === 'different') {
      if (isCustomized) {
        return {
          strategy: 'keep-fork',
          reason: `Fork is behind upstream and flagged as customized`,
        };
      }

      return {
        strategy: 'keep-upstream',
        reason: `Blob differs and fork is behind upstream`,
      };
    }
  }

  // 6. Diverged histories → unsafe
  if (commitStatus === 'diverged') {
    if (isCustomized) {
      return {
        strategy: 'keep-fork',
        reason: `History ${commitStatus} but flagged as customized`,
      };
    }
    return {
      strategy: 'manual',
      reason: `History ${commitStatus}, cannot auto-resolve`,
    };
  }

  // 7. Unrelated histories → unsafe
  if (commitStatus === 'unrelated') {
    if (isCustomized) {
      return {
        strategy: 'remove-from-fork',
        reason: `History ${commitStatus} but flagged as customized`,
      };
    }
    return {
      strategy: 'manual',
      reason: `History ${commitStatus}, cannot auto-resolve`,
    };
  }

  // 8. Fallback
  return {
    strategy: 'unknown',
    reason: 'Could not determine merge strategy',
  };
}
