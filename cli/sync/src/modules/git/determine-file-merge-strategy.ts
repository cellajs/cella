import { STRATEGY_REASONS } from '#/constants/status';
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
 * - `pinned` - Never sync (existing OR deleted files); pinned means full fork control
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
  const { forkFile, blobStatus } = fileAnalysis;

  // 1. Ignored files → skip all upstream changes (existing and new)
  if (isIgnored) {
    return {
      strategy: 'skip-upstream',
      reason: STRATEGY_REASONS.ignored,
    };
  }

  // 2. Blobs identical → no action needed
  if (blobStatus === 'identical') {
    return {
      strategy: 'keep-fork',
      reason: STRATEGY_REASONS.identical,
    };
  }

  // 3. Pinned files → always keep fork version (existing, modified, or deleted)
  // If fork deleted a pinned file, respect that deletion
  if (isPinned) {
    return {
      strategy: 'keep-fork',
      reason: STRATEGY_REASONS.pinned,
    };
  }

  // 4. New file in upstream (doesn't exist in fork, not pinned) → add it
  const isNewFile = !forkFile || blobStatus === 'missing';
  if (isNewFile) {
    return {
      strategy: 'keep-upstream',
      reason: STRATEGY_REASONS.newFile,
    };
  }

  // 5. Non-pinned, non-ignored, blobs differ → always sync to upstream
  // This ensures fork eventually matches upstream for all non-overridden files
  if (blobStatus === 'different') {
    return {
      strategy: 'keep-upstream',
      reason: STRATEGY_REASONS.syncing,
    };
  }

  // 6. Fallback (should rarely hit this)
  return {
    strategy: 'unknown',
    reason: STRATEGY_REASONS.unknown,
  };
}
