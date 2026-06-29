/**
 * Direction-agnostic ref analyzer for sync CLI.
 *
 * Compares a "local" ref against an "incoming" ref using a shared merge-base,
 * classifying every changed file (identical / ahead / local / drifted / behind /
 * diverged / pinned / ignored / deleted / renamed). It works purely on git
 * plumbing (ls-tree, diff-tree, log) against refs — never the working tree.
 *
 * Both directions reuse it:
 * - sync (merge-engine): local = fork HEAD, incoming = upstream
 * - contributions: local = cella branch, incoming = fork branch
 *
 * The result fields `existsInFork`/`existsInUpstream` map to local/incoming
 * respectively (named for the sync direction, reused as-is for contributions).
 */

import type { AnalyzedFile, FileStatus } from '../config/types';
import { getFileChangeInfo, getFileChanges, getFileHashesAtRef } from '../utils/git';

/** Predicates and options that steer classification (direction-specific). */
export interface AnalyzePredicates {
  /** True if the file is inside owned/ignored territory (never synced). */
  isIgnored: (path: string) => boolean;
  /** True if the file is pinned (local wins on conflict). */
  isPinned: (path: string) => boolean;
  /** Treat drifted files as behind (overwrite local with incoming). */
  hard?: boolean;
}

/** Progress callback type - receives a message string. */
type ProgressCallback = (message: string) => void;

/**
 * Analyze files between a local and an incoming ref using a merge-base.
 *
 * @param repoPath - Repo where all refs are reachable (git ops run here)
 * @param localRef - The "ours" ref (e.g. fork HEAD, or cella branch)
 * @param incomingRef - The "theirs" ref (e.g. upstream, or fork branch)
 * @param mergeBaseRef - Common ancestor ref used for 3-way comparison
 * @param predicates - Direction-specific ignore/pin/hard behavior
 */
export async function analyzeRefs(
  repoPath: string,
  localRef: string,
  incomingRef: string,
  mergeBaseRef: string,
  predicates: AnalyzePredicates,
  onProgress?: ProgressCallback,
): Promise<AnalyzedFile[]> {
  onProgress?.('collecting file hashes (batch)...');

  // Batch get all file hashes at each ref (one git call per ref)
  const [forkHashes, upstreamHashes, baseHashes] = await Promise.all([
    getFileHashesAtRef(repoPath, localRef),
    getFileHashesAtRef(repoPath, incomingRef),
    getFileHashesAtRef(repoPath, mergeBaseRef),
  ]);

  // Get only files that changed between base and incoming (includes renames with -M90%)
  const upstreamChanges = await getFileChanges(repoPath, mergeBaseRef, incomingRef);
  // Get only files that changed between base and local
  const forkChanges = await getFileChanges(repoPath, mergeBaseRef, localRef);

  // Build a map of old paths that were renamed in incoming (oldPath -> newPath)
  const upstreamRenames = new Map<string, string>();
  for (const [newPath, change] of upstreamChanges) {
    if (change.status === 'R' && change.oldPath) {
      upstreamRenames.set(change.oldPath, newPath);
    }
  }

  // Combined set of all files (for completeness, but we'll only analyze non-identical)
  // Also include old paths from renames to properly track them
  const allFiles = new Set([...forkHashes.keys(), ...upstreamHashes.keys(), ...upstreamRenames.keys()]);

  // Files that actually need analysis (changed somewhere)
  const changedFiles = new Set([...upstreamChanges.keys(), ...forkChanges.keys(), ...upstreamRenames.keys()]);

  onProgress?.(
    `analyzing ${changedFiles.size} changed files (${allFiles.size - changedFiles.size} identical skipped)...`,
  );

  const analyzedFiles: AnalyzedFile[] = [];
  // Track old paths that have been handled as part of a rename
  const handledOldPaths = new Set<string>();
  let processed = 0;

  for (const filePath of allFiles) {
    // Skip old paths that were already handled as part of a rename
    if (handledOldPaths.has(filePath)) continue;

    const inFork = forkHashes.has(filePath);
    const inUpstream = upstreamHashes.has(filePath);

    const fileIsIgnored = predicates.isIgnored(filePath);
    const fileIsPinned = predicates.isPinned(filePath);

    // Check if this file is the NEW path of an incoming rename
    const upstreamChange = upstreamChanges.get(filePath);
    const isUpstreamRename = upstreamChange?.status === 'R' && upstreamChange.oldPath;

    // Check if this file is the OLD path that was renamed in incoming
    const renamedToPath = upstreamRenames.get(filePath);

    // Fast path: if file didn't change anywhere, it's identical
    if (!changedFiles.has(filePath) && inFork && inUpstream) {
      analyzedFiles.push({
        path: filePath,
        status: 'identical',
        isIgnored: fileIsIgnored,
        isPinned: fileIsPinned,
        existsInFork: true,
        existsInUpstream: true,
      });
      continue;
    }

    processed++;
    if (processed % 100 === 0) {
      onProgress?.(`analyzing ${processed}/${changedFiles.size} changed files...`);
    }

    const forkHash = forkHashes.get(filePath) ?? null;
    const upstreamHash = upstreamHashes.get(filePath) ?? null;
    const baseHash = baseHashes.get(filePath) ?? null;

    // Determine status
    let status: FileStatus;
    let renamedFrom: string | undefined;

    // Handle incoming renames
    if (isUpstreamRename && upstreamChange.oldPath) {
      const oldPath = upstreamChange.oldPath;
      const oldPathInFork = forkHashes.has(oldPath);
      const forkOldHash = forkHashes.get(oldPath) ?? null;
      const baseOldHash = baseHashes.get(oldPath) ?? null;

      // Mark the old path as handled so we don't process it separately
      handledOldPaths.add(oldPath);

      // Check if local modified the old file
      const forkModifiedOld = forkOldHash !== baseOldHash;

      // Check both old and new paths for pinned/ignored status.
      // When a directory is renamed (e.g., config/ → shared/), the local
      // pinned list may still reference the old path.
      const oldPathPinned = predicates.isPinned(oldPath);

      if (fileIsPinned || oldPathPinned || predicates.isIgnored(oldPath)) {
        // Pinned or ignored - keep local's version at the new path
        status = 'pinned';
      } else if (!oldPathInFork) {
        // Old path doesn't exist locally (already deleted or moved it)
        // Treat as normal behind - let git's merge handle it
        status = 'behind';
      } else if (forkModifiedOld) {
        // Local modified the old file - this is a diverged situation
        // Let git's merge handle the conflict naturally
        status = 'diverged';
        renamedFrom = oldPath;
      } else {
        // Local has unmodified old file - this is a clean rename to apply
        status = 'renamed';
        renamedFrom = oldPath;
      }

      analyzedFiles.push({
        path: filePath,
        status,
        isIgnored: fileIsIgnored,
        isPinned: fileIsPinned,
        existsInFork: inFork,
        existsInUpstream: true,
        renamedFrom,
      });
      continue;
    }

    // Skip old paths that were renamed - they'll be handled via the new path
    if (renamedToPath) {
      // This is an old path that incoming renamed - skip it, handled above
      handledOldPaths.add(filePath);
      continue;
    }

    if (fileIsIgnored) {
      status = 'ignored';
    } else if (!inFork && inUpstream) {
      // Incoming added a new file
      status = fileIsPinned ? 'deleted' : 'behind';
    } else if (inFork && !inUpstream) {
      // File exists locally but not in incoming
      if (baseHash !== null) {
        // File was in base, incoming deleted it - sync deletion unless pinned
        status = fileIsPinned ? 'ahead' : 'behind';
      } else {
        // Local file (never existed in merge-base)
        // Check if this file's content exists at a different path in incoming
        // (indicates a rename that we couldn't detect due to squash merge-base)
        const forkFileHash = forkHash;
        let isRenamedSource = false;
        if (forkFileHash) {
          for (const [upPath, upHash] of upstreamHashes) {
            if (upHash === forkFileHash && upPath !== filePath) {
              // Same content at different path - this is likely a rename source
              isRenamedSource = true;
              break;
            }
          }
        }
        status = isRenamedSource ? 'behind' : 'local';
      }
    } else if (forkHash === upstreamHash) {
      // Identical
      status = 'identical';
    } else {
      // Both exist but different
      const forkChanged = forkHash !== baseHash;
      const upstreamChanged = upstreamHash !== baseHash;

      if (forkChanged && upstreamChanged) {
        // Both changed - diverged or pinned conflict
        status = fileIsPinned ? 'pinned' : 'diverged';
      } else if (forkChanged && !upstreamChanged) {
        // Only local changed
        // --hard mode: treat drifted as behind (overwrite with incoming)
        status = fileIsPinned ? 'ahead' : predicates.hard ? 'behind' : 'drifted';
      } else if (!forkChanged && upstreamChanged) {
        // Only incoming changed
        status = 'behind';
      } else {
        // Base is different but local and incoming are same relative to base
        status = 'identical';
      }
    }

    analyzedFiles.push({
      path: filePath,
      status,
      isIgnored: fileIsIgnored,
      isPinned: fileIsPinned,
      existsInFork: inFork,
      existsInUpstream: inUpstream,
    });
  }

  return analyzedFiles;
}

/**
 * Enrich analyzed files with change dates and commit hashes.
 *
 * Mutates each non-identical file in place: local-side dates for ahead/drifted,
 * incoming-side dates for behind, and both sides for diverged/pinned.
 *
 * @param repoPath - Repo where the refs are reachable
 * @param files - Files to enrich (mutated in place)
 * @param mergeBaseRef - Common ancestor ref
 * @param localRef - The "ours" ref
 * @param incomingRef - The "theirs" ref
 */
export async function enrichChangeInfo(
  repoPath: string,
  files: AnalyzedFile[],
  mergeBaseRef: string,
  localRef: string,
  incomingRef: string,
): Promise<void> {
  const forkInfo = await getFileChangeInfo(repoPath, mergeBaseRef, localRef);
  const upstreamInfo = await getFileChangeInfo(repoPath, mergeBaseRef, incomingRef);

  for (const file of files) {
    if (file.status === 'identical') continue;

    if (file.status === 'ahead' || file.status === 'drifted') {
      const info = forkInfo.get(file.path);
      if (info) {
        file.changedAt = info.date;
        file.changedCommit = info.hash;
      }
    } else if (file.status === 'behind') {
      const info = upstreamInfo.get(file.path);
      if (info) {
        file.changedAt = info.date;
        file.changedCommit = info.hash;
      }
    } else if (file.status === 'diverged' || file.status === 'pinned') {
      // For diverged/pinned: store both local and incoming info
      const forkFileInfo = forkInfo.get(file.path);
      const upstreamFileInfo = upstreamInfo.get(file.path);
      if (forkFileInfo) {
        file.changedAt = forkFileInfo.date;
        file.changedCommit = forkFileInfo.hash;
      }
      if (upstreamFileInfo) {
        file.upstreamChangedAt = upstreamFileInfo.date;
        file.upstreamCommit = upstreamFileInfo.hash;
      }
    }
  }
}
