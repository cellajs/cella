import { FileAnalysis, FileMergeStrategy } from "../../types";

/**
 * Determines the most appropriate merge strategy for a given file,
 * based on commit history, blob comparisons, and override metadata.
 *
 * @param fileAnalysis - Precomputed analysis object for a single file,
 *   containing commit history, blob status, and optional override metadata.
 *
 * @returns A {@link FileMergeStrategy} object indicating which merge
 *   action to take (e.g., "keep-fork", "remove-from-fork", "manual").
 */
export function determineFileMergeStrategy(
  fileAnalysis: FileAnalysis
): FileMergeStrategy {
  // Extract flags
  const flaggedAsCustomized = fileAnalysis.swizzle?.flaggedInSettingsAs === 'customized';
  const flaggedAsIgnored = fileAnalysis.swizzle?.flaggedInSettingsAs === 'ignored';

  const swizzleInfo = fileAnalysis.swizzle?.newMetadata || fileAnalysis.swizzle?.existingMetadata;

  // 1. Flagged as ignored in settings → remove
  if (flaggedAsIgnored) {
    return {
      strategy: "remove-from-fork",
      reason: "Flagged as ignored in settings",
    };
  }

  // 2. Swizzle overrides everything
  if (swizzleInfo?.swizzled) {
    if (swizzleInfo.event === "removed") {
      return {
        strategy: "remove-from-fork",
        reason: "Swizzled (removed in fork)",
      };
    }
    if (swizzleInfo.event === "edited") {
      return {
        strategy: "keep-fork",
        reason: "Swizzled (edited in fork)",
      };
    }
  }

  const { upstreamFile, forkFile, blobStatus, commitSummary } = fileAnalysis;
  const commitStatus = commitSummary?.status || "unrelated";
  const isHeadIdentical = upstreamFile.lastCommitSha === forkFile?.lastCommitSha;

  // 3. Commit heads identical → trivial keep
  if (isHeadIdentical) {
    return {
      strategy: "keep-fork",
      reason: "Commit HEADs identical",
    };
  }

  // 4. Blobs identical → trivial keep
  if (blobStatus === "identical") {
    return {
      strategy: "keep-fork",
      reason: "Blobs identical",
    };
  }

  // 5. When fork is up-to-date or ahead → assume resolved in fork
  if (commitStatus === "upToDate" || commitStatus === "ahead") {
    if (blobStatus === "different") {
      return {
        strategy: "keep-fork",
        reason: `Blob differs but history is ${commitStatus}`,
      };
    }
    if (blobStatus === "missing") {
      return {
        strategy: "remove-from-fork",
        reason: `Blob missing but history is ${commitStatus}`,
      };
    }
  }

  // 6. When fork is behind upstream → usually keep upstream
  if (commitStatus === "behind") {
    if (blobStatus === "different") {
      if (flaggedAsCustomized) {
        return {
          strategy: "keep-fork",
          reason: `Fork is behind upstream and flagged as customized`,
        };
      }

      return {
        strategy: "keep-upstream",
        reason: `Blob differs and fork is behind upstream`,
      };
    }
  }

  // 7. Diverged histories → unsafe
  if (commitStatus === "diverged") {
    if (flaggedAsCustomized) {
      return {
        strategy: "keep-fork",
        reason: `History ${commitStatus} but flagged as customized`,
      };
    }
    return {
      strategy: "manual",
      reason: `History ${commitStatus}, cannot auto-resolve`
    };
  }

  // 8. Unrelated histories → unsafe
  if (commitStatus === "unrelated") {
    if (flaggedAsCustomized) {
      return {
        strategy: "remove-from-fork",
        reason: `History ${commitStatus} but flagged as customized`,
      };
    }
    return {
      strategy: "manual",
      reason: `History ${commitStatus}, cannot auto-resolve`
    };
  }

  // 9. Fallback
  return {
    strategy: "unknown",
    reason: "Could not determine merge strategy"
  };
}