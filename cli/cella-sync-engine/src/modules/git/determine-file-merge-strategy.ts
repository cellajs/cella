import { FileAnalysis, FileMergeStrategy } from "../../types";

/**
 * Determines the most appropriate merge strategy for a given file,
 * based on commit history, blob comparisons, and swizzle metadata.
 *
 * Resolution priority is as follows:
 * 1. **Swizzle metadata** — if the file is explicitly swizzled in the fork,
 *    prefer the fork’s decision (keep or remove).
 * 2. **Commit HEADs identical** — if the last modifying commits match,
 *    no merge is required (keep fork).
 * 3. **Blobs identical** — if file contents are identical,
 *    no merge is required (keep fork).
 * 4. **Commit history "upToDate" or "ahead"** — assume that conflicts were
 *    resolved earlier in the fork. Prefer keeping fork or removing if missing.
 * 5. **Commit history "diverged" or "unrelated"** — cannot safely auto-resolve,
 *    requires manual intervention.
 * 6. **Fallback** — if none of the above conditions match, return "unknown".
 *
 * @param fileAnalysis - Precomputed analysis object for a single file,
 *   containing commit history, blob status, and optional swizzle metadata.
 *
 * @returns A {@link FileMergeStrategy} object indicating which merge
 *   action to take (e.g., "keep-fork", "remove-from-fork", "manual").
 */
export function determineFileMergeStrategy(
  fileAnalysis: FileAnalysis
): FileMergeStrategy {
  // Extract flags
  const flaggedInSettingsAsEdited = fileAnalysis.swizzle?.flaggedInSettingsAs === 'edited';
  const flaggedInSettingsAsRemoved = fileAnalysis.swizzle?.flaggedInSettingsAs === 'removed';

  const swizzleInfo = fileAnalysis.swizzle?.newMetadata || fileAnalysis.swizzle?.existingMetadata;

  // 1. Flagged as removed in settings → remove
  if (flaggedInSettingsAsRemoved) {
    return {
      strategy: "remove-from-fork",
      reason: "Flagged as removed in settings",
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

  const { boilerplateFile, forkFile, blobStatus, commitSummary } = fileAnalysis;
  const commitStatus = commitSummary?.status || "unrelated";
  const isHeadIdentical = boilerplateFile.lastCommitSha === forkFile?.lastCommitSha;

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

  // 6. When fork is behind boilerplate → usually keep boilerplate
  if (commitStatus === "behind") {
    if (blobStatus === "different") {
      if (flaggedInSettingsAsEdited) {
        return {
          strategy: "keep-fork",
          reason: `Fork is behind boilerplate and flagged as edited`,
        };
      }

      return {
        strategy: "keep-boilerplate",
        reason: `Blob differs and fork is behind boilerplate`,
      };
    }
  }

  // 7. Diverged histories → unsafe
  if (commitStatus === "diverged") {
    if (flaggedInSettingsAsEdited) {
      return {
        strategy: "keep-fork",
        reason: `History ${commitStatus} but flagged as edited`,
      };
    }
    return {
      strategy: "manual",
      reason: `History ${commitStatus}, cannot auto-resolve`
    };
  }

  // 8. Unrelated histories → unsafe
  if (commitStatus === "unrelated") {
    if (flaggedInSettingsAsEdited) {
      return {
        strategy: "remove-from-fork",
        reason: `History ${commitStatus} but flagged as edited`,
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