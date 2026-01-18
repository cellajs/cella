import { FileAnalysis, FileMergeStrategy } from '#/types';

/**
 * Determines the most appropriate merge strategy for a given file,
 * based on commit history, blob comparisons, and override settings.
 *
 * Strategy meanings:
 * - `'keep-fork'` - Keep your app's version, discard upstream changes
 * - `'keep-upstream'` - Take upstream version (new file or update)
 * - `'skip-upstream'` - Skip/revert upstream changes (for ignored files)
 * - `'manual'` - Requires manual resolution (diverged histories)
 * - `'unknown'` - Could not determine, relies on git merge default
 *
 * @param fileAnalysis - Precomputed analysis object for a single file,
 *   containing commit history, blob status, and optional override status.
 *
 * @returns A {@link FileMergeStrategy} object indicating which merge action to take.
 */
export function determineFileMergeStrategy(fileAnalysis: FileAnalysis): FileMergeStrategy {
  // Extract override flags from config
  const isPinned = fileAnalysis.overrideStatus === 'pinned';
  const isIgnored = fileAnalysis.overrideStatus === 'ignored';

  // 1. Flagged as ignored in settings → skip upstream changes
  if (isIgnored) {
    return {
      strategy: 'skip-upstream',
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
      // File was intentionally deleted in fork while ahead/upToDate
      return {
        strategy: 'skip-upstream',
        reason: `File deleted in fork and history is ${commitStatus}`,
      };
    }
  }

  // 5. When fork is behind upstream
  if (commitStatus === 'behind') {
    // 5a. File content differs
    if (blobStatus === 'different') {
      if (isPinned) {
        return {
          strategy: 'keep-fork',
          reason: 'Fork is behind upstream but flagged as pinned',
        };
      }
      return {
        strategy: 'keep-upstream',
        reason: 'Blob differs and fork is behind upstream',
      };
    }
    // 5b. New file in upstream (doesn't exist in fork)
    // TODO: This path is unreachable for truly new files. When a file doesn't exist in fork,
    // there's no commit history to compare, so analyzeFileCommits returns 'unrelated' not 'behind'.
    // New upstream files currently fall through to the 'unrelated' case and require manual resolution.
    // Consider detecting new files earlier (via blobStatus === 'missing' && !forkFile) and auto-accepting.
    if (blobStatus === 'missing') {
      return {
        strategy: 'keep-upstream',
        reason: 'New file in upstream',
      };
    }
  }

  // 6. Diverged histories → unsafe without pinned flag
  if (commitStatus === 'diverged') {
    if (isPinned) {
      return {
        strategy: 'keep-fork',
        reason: 'History diverged but flagged as pinned',
      };
    }
    return {
      strategy: 'manual',
      reason: 'History diverged, requires manual resolution',
    };
  }

  // 7. Unrelated histories (first sync scenario)
  if (commitStatus === 'unrelated') {
    if (isPinned) {
      return {
        strategy: 'keep-fork',
        reason: 'History unrelated but flagged as pinned',
      };
    }
    return {
      strategy: 'manual',
      reason: 'History unrelated, requires manual resolution',
    };
  }

  // 8. Fallback
  return {
    strategy: 'unknown',
    reason: 'Could not determine merge strategy',
  };
}
