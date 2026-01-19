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
 * Override behavior:
 * - `ignored` - Never sync (existing or new files), not shown in analysis
 * - `pinned` - Never sync existing files, but DO add new files; shown in analysis
 * - `none` - Always sync to match upstream
 *
 * @param fileAnalysis - Precomputed analysis object for a single file,
 *   containing commit history, blob status, and optional override status.
 *
 * @returns A {@link FileMergeStrategy} object indicating which merge action to take.
 */
export function determineFileMergeStrategy(fileAnalysis: FileAnalysis): FileMergeStrategy {
  const isPinned = fileAnalysis.overrideStatus === 'pinned';
  const isIgnored = fileAnalysis.overrideStatus === 'ignored';
  const { upstreamFile, forkFile, blobStatus, commitSummary } = fileAnalysis;
  const isNewFile = !forkFile || blobStatus === 'missing';

  // 1. Ignored files → skip all upstream changes (existing and new)
  if (isIgnored) {
    return {
      strategy: 'skip-upstream',
      reason: 'Flagged as ignored in settings',
    };
  }

  // 2. Blobs identical → no action needed
  if (blobStatus === 'identical') {
    return {
      strategy: 'keep-fork',
      reason: 'Blobs identical',
    };
  }

  // 3. New file in upstream (doesn't exist in fork) → always add, even if pinned
  // Pinned only protects existing files, not new ones
  if (isNewFile) {
    return {
      strategy: 'keep-upstream',
      reason: 'New file in upstream',
    };
  }

  // 4. Pinned existing files → never sync, keep fork version
  // Show in analysis to raise awareness about divergence
  if (isPinned) {
    return {
      strategy: 'keep-fork',
      reason: 'File is pinned to fork version',
    };
  }

  // 5. Non-pinned, non-ignored, blobs differ → always sync to upstream
  // This ensures fork eventually matches upstream for all non-overridden files
  if (blobStatus === 'different') {
    return {
      strategy: 'keep-upstream',
      reason: 'Syncing to match upstream',
    };
  }

  // 6. Fallback (should rarely hit this)
  return {
    strategy: 'unknown',
    reason: 'Could not determine merge strategy',
  };
}
