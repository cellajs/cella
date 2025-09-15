import { FileAnalysis, FileMergeStrategy } from "../../types";

/**
 * Determines the most appropriate merge strategy for a given file,
 * based on commit history, blob comparisons, and zwizzle metadata.
 *
 * Resolution priority is as follows:
 * 1. **Zwizzle metadata** — if the file is explicitly zwizzled in the fork,
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
 *   containing commit history, blob status, and optional zwizzle metadata.
 *
 * @returns A {@link FileMergeStrategy} object indicating which merge
 *   action to take (e.g., "keep-fork", "remove-from-fork", "manual").
 */
export function determineFileMergeStrategy(
  fileAnalysis: FileAnalysis
): FileMergeStrategy {
  const zwizzleInfo = fileAnalysis.zwizzle?.newMetadata || fileAnalysis.zwizzle?.existingMetadata;

  // 1. Zwizzle overrides everything
  if (zwizzleInfo?.zwizzled) {
    if (zwizzleInfo.event === "removed") {
      return { 
        strategy: "remove-from-fork", 
        reason: "Zwizzled (removed in fork)",
      };
    }
  }

  const { boilerplateFile, forkFile, blobStatus, commitSummary } = fileAnalysis;
  const commitStatus = commitSummary?.status || "unrelated";
  const isHeadIdentical = boilerplateFile.lastCommitSha === forkFile?.lastCommitSha;

  // 2. Commit heads identical → trivial keep
  if (isHeadIdentical) {
    return { 
      strategy: "keep-fork", 
      reason: "Commit HEADs identical",
    };
  }

  // 3. Blobs identical → trivial keep
  if (blobStatus === "identical") {
    return {
      strategy: "keep-fork", 
      reason: "Blobs identical",
    };
  }

  // 4. When fork is up-to-date or ahead → assume resolved in fork
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

  if (commitStatus === "behind") {
    if (blobStatus === "different") {
      return { 
        strategy: "keep-boilerplate", 
        reason: `Blob differs and fork is behind boilerplate`,
      };
    }
  }

  // 6. Diverged/unrelated histories → unsafe
  if (commitStatus === "diverged" || commitStatus === "unrelated") {
    return { 
      strategy: "manual", 
      reason: `History ${commitStatus}, cannot auto-resolve` 
    };
  }

  // 5. Fallback
  return { 
    strategy: "unknown", 
    reason: "Could not determine merge strategy" 
  };
}