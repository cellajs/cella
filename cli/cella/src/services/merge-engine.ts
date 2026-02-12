/**
 * Merge Engine for sync CLI v2.
 *
 * Two modes:
 * - Analyze (dry run): Uses worktree to preview changes without affecting fork
 * - Sync: Performs real merge directly in fork for full IDE support
 *
 * Sync mode approach:
 * 1. Start real merge in fork (git merge --no-commit)
 * 2. Apply resolutions directly (pinned→ours, ignored→rm, diverged→git's merge)
 * 3. Leave fork in merge state - conflicts have markers for IDE 3-way merge
 *
 * Key principle: Fork stays in real merge state for IDE conflict resolution.
 */

import type { AnalysisSummary, AnalyzedFile, FileStatus, MergeResult, RuntimeConfig } from '../config/types';
import {
  cleanupLeftoverWorktrees,
  cleanupWorktree,
  detectLeftoverWorktree,
  getWorktreePath,
  registerWorktree,
} from '../utils/cleanup';
import {
  checkoutFromRef,
  countCommitsBetween,
  createWorktree,
  ensureRemote,
  fetch,
  fileExistsAtRef,
  fileExistsInWorktree,
  getCommitInfo,
  getConflictedFiles,
  getEffectiveMergeBase,
  getFileChangeInfo,
  getFileChanges,
  getFileHashesAtRef,
  getRemoteUrl,
  gitMv,
  gitRm,
  merge,
  mergeAbort,
  removeFileFromWorktree,
  removeMergeHead,
  restoreToHead,
  storeLastSyncRef,
} from '../utils/git';
import { isIgnored, isPinned } from '../utils/overrides';

/** Progress callback type - receives message and optional detail for sub-line */
export type ProgressCallback = (message: string, detail?: string) => void;

/** Step completion callback - marks a step as done with optional detail */
export type StepCallback = (label: string, detail?: string) => void;

/**
 * Convert a git remote URL to a GitHub base URL.
 * Supports both SSH (git@github.com:org/repo.git) and HTTPS formats.
 */
function getGitHubBaseUrl(remoteUrl: string): string | null {
  // SSH format: git@github.com:cellajs/cella.git
  const sshMatch = remoteUrl.match(/git@github\.com:([^/]+)\/([^.]+)(?:\.git)?$/);
  if (sshMatch) {
    return `https://github.com/${sshMatch[1]}/${sshMatch[2]}`;
  }

  // HTTPS format: https://github.com/cellajs/cella.git
  const httpsMatch = remoteUrl.match(/https:\/\/github\.com\/([^/]+)\/([^/.]+)(?:\.git)?$/);
  if (httpsMatch) {
    return `https://github.com/${httpsMatch[1]}/${httpsMatch[2]}`;
  }

  return null;
}

/**
 * Convert a git remote URL to a GitHub commit URL.
 * Supports both SSH (git@github.com:org/repo.git) and HTTPS formats.
 */
function getGitHubCommitUrl(remoteUrl: string, commitHash: string): string | null {
  const baseUrl = getGitHubBaseUrl(remoteUrl);
  return baseUrl ? `${baseUrl}/commit/${commitHash}` : null;
}

/**
 * Apply sync directly in the fork with a real merge.
 *
 * Strategy:
 * 1. Start real merge in fork (git merge --no-commit)
 * 2. Apply resolutions directly (pinned→ours, ignored→rm, diverged→git's merge)
 * 3. Leave fork in merge state for IDE 3-way conflict resolution
 */
/**
 * Apply merge directly to fork (no worktree).
 *
 * Pre-analyzes files using refs (fork untouched), then merges and resolves.
 * Fork is left in merge state with MERGE_HEAD for IDE 3-way merge.
 */
async function applyDirectMerge(
  forkPath: string,
  upstreamRef: string,
  mergeBaseRef: string,
  config: RuntimeConfig,
  onProgress?: ProgressCallback,
): Promise<{ resolved: number; remainingConflicts: string[]; analyzedFiles: AnalyzedFile[] }> {
  // Pre-analyze files BEFORE merge (all ref-based, doesn't need merge state).
  // This keeps the fork working tree clean during the slow analysis phase,
  // so the IDE doesn't show distracting intermediate file changes.
  onProgress?.('analyzing files...');
  const analyzedFiles = await analyzeFiles(forkPath, forkPath, upstreamRef, mergeBaseRef, config, onProgress);

  // Start real merge in fork (always real merge, never --squash).
  // Squash strategy is handled post-merge by removing MERGE_HEAD before auto-commit,
  // which preserves correct 3-way merge behavior and merge-base ancestry.
  // Done after analysis so the fork is only in merge state during the fast resolution phase.
  onProgress?.('starting merge in fork...');
  await merge(forkPath, upstreamRef, { noCommit: true, noEdit: true });

  // Apply resolutions directly in fork
  let resolved = 0;

  for (const file of analyzedFiles) {
    const { path: filePath, status, isPinned: pinned, isIgnored: ignored, existsInFork } = file;

    if (status === 'identical' || status === 'ahead') {
      continue;
    }

    if (ignored) {
      if (existsInFork) {
        onProgress?.(`→ ${filePath}: keeping fork (ignored)`);
        await restoreToHead(forkPath, filePath);
      } else {
        onProgress?.(`→ ${filePath}: removing (ignored, new from upstream)`);
        await gitRm(forkPath, filePath);
        await removeFileFromWorktree(forkPath, filePath);
      }
      resolved++;
      continue;
    }

    if (pinned) {
      if (file.renamedFrom) {
        // Renamed file where old path was pinned — accept the rename (new path)
        // but keep fork's content from the old path
        const oldPathExists = await fileExistsInWorktree(forkPath, file.renamedFrom);
        if (oldPathExists) {
          onProgress?.(`→ ${file.renamedFrom} → ${filePath}: moving fork content (pinned rename)`);
          try {
            await gitMv(forkPath, file.renamedFrom, filePath);
          } catch {
            // git mv failed — copy content manually
            await gitRm(forkPath, file.renamedFrom);
            await removeFileFromWorktree(forkPath, file.renamedFrom);
            // Checkout upstream's new path first, then restore fork content
            await checkoutFromRef(forkPath, 'HEAD', file.renamedFrom).catch(() => {});
          }
        } else {
          // Old path already gone — restore from HEAD at old path via git show
          onProgress?.(`→ ${filePath}: keeping fork content (pinned rename, old path removed)`);
          await restoreToHead(forkPath, filePath);
        }
      } else {
        onProgress?.(`→ ${filePath}: keeping fork (pinned)`);
        await restoreToHead(forkPath, filePath);
      }
      resolved++;
      continue;
    }

    if (status === 'diverged') {
      // Let git's merge result stand - trust the merge
      onProgress?.(`→ ${filePath}: using git merge result (diverged)`);
      resolved++;
      continue;
    }

    if (status === 'behind') {
      // File only in upstream or upstream has newer version
      if (!existsInFork) {
        // Upstream added new file
        onProgress?.(`→ ${filePath}: adding from upstream (new file)`);
        await checkoutFromRef(forkPath, upstreamRef, filePath);
      } else if (!file.existsInUpstream) {
        // Upstream deleted file - remove from fork
        onProgress?.(`→ ${filePath}: removing (deleted in upstream)`);
        await gitRm(forkPath, filePath);
        // Also remove from filesystem if git rm didn't (e.g., after squash merge)
        await removeFileFromWorktree(forkPath, filePath);
      } else {
        // Both exist, only upstream changed - accept upstream version explicitly.
        // This resolves false conflicts from stale merge-base (previous squash syncs).
        onProgress?.(`→ ${filePath}: accepting upstream (behind)`);
        await checkoutFromRef(forkPath, upstreamRef, filePath);
      }
      resolved++;
      continue;
    }

    if (status === 'drifted') {
      if (config.hard) {
        // --hard: reset drifted files to upstream version
        onProgress?.(`→ ${filePath}: resetting to upstream (--hard)`);
        await checkoutFromRef(forkPath, upstreamRef, filePath);
        resolved++;
      }
      continue;
    }

    if (status === 'deleted') {
      if (await fileExistsInWorktree(forkPath, filePath)) {
        await gitRm(forkPath, filePath);
        await removeFileFromWorktree(forkPath, filePath);
      }
      resolved++;
      continue;
    }

    if (status === 'renamed' && file.renamedFrom) {
      // Upstream renamed a file - apply as git mv to preserve history
      const oldPath = file.renamedFrom;
      const oldPathExists = await fileExistsInWorktree(forkPath, oldPath);
      const newPathExists = await fileExistsInWorktree(forkPath, filePath);

      if (oldPathExists && !newPathExists) {
        // Old exists, new doesn't - use git mv to move the file, preserving history
        onProgress?.(`→ ${oldPath} → ${filePath}: moving (renamed in upstream)`);
        try {
          await gitMv(forkPath, oldPath, filePath);
        } catch {
          // git mv failed (possibly due to merge state) - fall back to manual approach
          await gitRm(forkPath, oldPath);
          await removeFileFromWorktree(forkPath, oldPath);
          await checkoutFromRef(forkPath, upstreamRef, filePath);
        }
      } else if (oldPathExists && newPathExists) {
        // Both exist (merge already staged the new file, but old still in worktree)
        // Remove old and ensure new has correct content
        onProgress?.(`→ ${oldPath} → ${filePath}: completing rename (removing old)`);
        await gitRm(forkPath, oldPath);
        await removeFileFromWorktree(forkPath, oldPath);
        await checkoutFromRef(forkPath, upstreamRef, filePath);
      } else if (!oldPathExists && newPathExists) {
        // Rename already fully applied - just ensure content is correct
        onProgress?.(`→ ${filePath}: updating from upstream (rename already applied)`);
        await checkoutFromRef(forkPath, upstreamRef, filePath);
      } else {
        // Neither exists - checkout new path from upstream
        onProgress?.(`→ ${filePath}: adding from upstream (renamed)`);
        await checkoutFromRef(forkPath, upstreamRef, filePath);
      }
      resolved++;
      continue;
    }
  }

  // Handle remaining git conflicts (only auto-resolve ignored/pinned)
  const gitConflicts = await getConflictedFiles(forkPath);
  for (const filePath of gitConflicts) {
    const fileIsIgnored = isIgnored(filePath, config);
    const fileIsPinned = isPinned(filePath, config);

    if (fileIsIgnored) {
      const existsInFork = await fileExistsAtRef(forkPath, 'HEAD', filePath);
      if (existsInFork) {
        onProgress?.(`→ ${filePath}: keeping fork (ignored conflict)`);
        await restoreToHead(forkPath, filePath);
      } else {
        onProgress?.(`→ ${filePath}: removing (ignored conflict)`);
        await gitRm(forkPath, filePath);
        await removeFileFromWorktree(forkPath, filePath);
      }
      resolved++;
    } else if (fileIsPinned) {
      onProgress?.(`→ ${filePath}: keeping fork (pinned conflict)`);
      await restoreToHead(forkPath, filePath);
      resolved++;
    }
    // Non-ignored, non-pinned conflicts are left for user in IDE
  }

  // Get remaining conflicts (these have markers for IDE)
  const remainingConflicts = await getConflictedFiles(forkPath);

  return { resolved, remainingConflicts, analyzedFiles };
}

/**
 * Analyze files to determine their sync status.
 *
 * OPTIMIZED: Uses batch git operations and skips identical files.
 * - Gets all file hashes in one call per ref (not per file)
 * - Uses diff-tree to identify changed files between base and upstream
 * - Only does detailed analysis on changed files
 * - Detects renames from upstream for proper git mv handling
 */
async function analyzeFiles(
  _worktreePath: string,
  forkPath: string,
  upstreamRef: string,
  mergeBaseRef: string,
  config: RuntimeConfig,
  onProgress?: ProgressCallback,
): Promise<AnalyzedFile[]> {
  onProgress?.('collecting file hashes (batch)...');

  // Batch get all file hashes at each ref (one git call per ref)
  const [forkHashes, upstreamHashes, baseHashes] = await Promise.all([
    getFileHashesAtRef(forkPath, 'HEAD'),
    getFileHashesAtRef(forkPath, upstreamRef),
    getFileHashesAtRef(forkPath, mergeBaseRef),
  ]);

  // Get only files that changed between base and upstream (includes renames with -M90%)
  const upstreamChanges = await getFileChanges(forkPath, mergeBaseRef, upstreamRef);
  // Get only files that changed between base and fork
  const forkChanges = await getFileChanges(forkPath, mergeBaseRef, 'HEAD');

  // Build a map of old paths that were renamed in upstream (oldPath -> newPath)
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

    const fileIsIgnored = isIgnored(filePath, config);
    const fileIsPinned = isPinned(filePath, config);

    // Check if this file is the NEW path of an upstream rename
    const upstreamChange = upstreamChanges.get(filePath);
    const isUpstreamRename = upstreamChange?.status === 'R' && upstreamChange.oldPath;

    // Check if this file is the OLD path that was renamed in upstream
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

    // Handle upstream renames
    if (isUpstreamRename && upstreamChange.oldPath) {
      const oldPath = upstreamChange.oldPath;
      const oldPathInFork = forkHashes.has(oldPath);
      const forkOldHash = forkHashes.get(oldPath) ?? null;
      const baseOldHash = baseHashes.get(oldPath) ?? null;

      // Mark the old path as handled so we don't process it separately
      handledOldPaths.add(oldPath);

      // Check if fork modified the old file
      const forkModifiedOld = forkOldHash !== baseOldHash;

      // Check both old and new paths for pinned/ignored status.
      // When a directory is renamed (e.g., config/ → shared/), the fork's
      // pinned list may still reference the old path.
      const oldPathPinned = isPinned(oldPath, config);

      if (fileIsPinned || oldPathPinned || isIgnored(oldPath, config)) {
        // Pinned or ignored - keep fork's version at the new path
        status = 'pinned';
      } else if (!oldPathInFork) {
        // Old path doesn't exist in fork (fork already deleted or moved it)
        // Treat as normal behind - let git's merge handle it
        status = 'behind';
      } else if (forkModifiedOld) {
        // Fork modified the old file - this is a diverged situation
        // Let git's merge handle the conflict naturally
        status = 'diverged';
        renamedFrom = oldPath;
      } else {
        // Fork has unmodified old file - this is a clean rename to apply
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
      // This is an old path that upstream renamed - skip it, handled above
      handledOldPaths.add(filePath);
      continue;
    }

    if (fileIsIgnored) {
      status = 'ignored';
    } else if (!inFork && inUpstream) {
      // Upstream added a new file
      status = fileIsPinned ? 'deleted' : 'behind';
    } else if (inFork && !inUpstream) {
      // File exists in fork but not upstream
      if (baseHash !== null) {
        // File was in base, upstream deleted it - sync deletion unless pinned
        status = fileIsPinned ? 'ahead' : 'behind';
      } else {
        // Local file (never existed in merge-base)
        // Check if this file's content exists at a different path in upstream
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
        // Only fork changed
        status = fileIsPinned ? 'ahead' : 'drifted';
      } else if (!forkChanged && upstreamChanged) {
        // Only upstream changed
        status = 'behind';
      } else {
        // Base is different but fork and upstream are same relative to base
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
 * Calculate summary from analyzed files.
 */
function calculateSummary(files: AnalyzedFile[]): AnalysisSummary {
  const summary: AnalysisSummary = {
    identical: 0,
    ahead: 0,
    local: 0,
    drifted: 0,
    behind: 0,
    diverged: 0,
    pinned: 0,
    ignored: 0,
    deleted: 0,
    renamed: 0,
    total: files.length,
  };

  for (const file of files) {
    summary[file.status]++;
  }

  return summary;
}

/**
 * Main merge engine entry point.
 *
 * Creates worktree, performs merge, resolves all files,
 * and applies result via patch.
 */
export async function runMergeEngine(
  config: RuntimeConfig,
  options: {
    apply: boolean;
    onProgress?: ProgressCallback;
    onStep?: StepCallback;
  },
): Promise<MergeResult> {
  const { forkPath, upstreamRef } = config;
  const worktreePath = getWorktreePath(forkPath);
  const { apply, onProgress, onStep } = options;

  // Check for leftover worktree
  if (await detectLeftoverWorktree(forkPath)) {
    onProgress?.('cleaning up leftover worktree from previous run...');
    await cleanupLeftoverWorktrees(forkPath);
  }

  // Register worktree for cleanup on abort
  registerWorktree(forkPath, worktreePath);

  try {
    // Setup upstream remote
    onProgress?.('setting up upstream remote...');
    const remoteName = config.settings.upstreamRemoteName || 'cella-upstream';
    await ensureRemote(forkPath, remoteName, config.settings.upstreamUrl);
    onStep?.('remote configured', `${upstreamRef} → ${config.settings.upstreamUrl}`);

    // Fetch upstream
    onProgress?.(`fetching upstream (${remoteName})...`);
    await fetch(forkPath, remoteName);

    // Get GitHub base URLs for commit links
    const upstreamGitHubUrl = getGitHubBaseUrl(config.settings.upstreamUrl);
    const forkOriginUrl = await getRemoteUrl(forkPath, 'origin');
    const forkGitHubUrl = forkOriginUrl ? getGitHubBaseUrl(forkOriginUrl) : null;

    // Get effective merge base (handles stale base from previous squash syncs)
    const effectiveBase = await getEffectiveMergeBase(forkPath, 'HEAD', upstreamRef);
    const mergeBase = effectiveBase.base;

    // Get upstream commit info and count commits since merge-base
    const upstreamCommit = await getCommitInfo(forkPath, upstreamRef);
    const commitCount = await countCommitsBetween(forkPath, mergeBase, upstreamRef);
    const shortHash = upstreamCommit.hash.slice(0, 7);
    const githubUrl = getGitHubCommitUrl(config.settings.upstreamUrl, upstreamCommit.hash);
    const commitLabel = commitCount === 1 ? '1 new commit' : `${commitCount} new commits`;

    // Build multi-line info for fetched upstream
    let commitInfo = `${commitLabel} since last merge`;
    commitInfo += `\n  ${shortHash} "${upstreamCommit.message}" (${upstreamCommit.date})`;
    if (githubUrl) commitInfo += `\n  ${githubUrl}`;

    onStep?.('fetched upstream', commitInfo);

    // For sync mode, we'll do the merge directly in fork
    // For analyze mode, we use a worktree to preview changes
    if (apply) {
      // SYNC MODE: Do merge, analysis, and resolution directly in fork
      const {
        resolved: _resolved,
        remainingConflicts,
        analyzedFiles,
      } = await applyDirectMerge(forkPath, upstreamRef, mergeBase, config, onProgress);

      const summary = calculateSummary(analyzedFiles);
      const synced = summary.behind + summary.diverged + summary.renamed;
      const hardReset = config.hard ? summary.drifted : 0;
      const isSquash = config.settings.mergeStrategy === 'squash';

      // Count total resolved changes (includes ignored/pinned resolutions and --hard resets)
      const totalResolved = synced + summary.ignored + summary.pinned + hardReset;

      if (remainingConflicts.length > 0) {
        // Conflicts: leave MERGE_HEAD intact for IDE 3-way merge resolution.
        // When user commits, it becomes a merge commit (self-healing ancestry).
        await storeLastSyncRef(forkPath, upstreamCommit.hash);
        onStep?.('merge in progress', `${remainingConflicts.length} conflicts to resolve in IDE`);
      } else if (totalResolved > 0) {
        const parts: string[] = [];
        if (synced > 0) parts.push(`${synced} files from upstream`);
        if (hardReset > 0) parts.push(`${hardReset} drifted files reset`);
        const label = parts.length > 0 ? parts.join(', ') : 'upstream changes';
        if (isSquash) {
          // Remove MERGE_HEAD so commit becomes single-parent (squash-style)
          await removeMergeHead(forkPath);
        }
        await storeLastSyncRef(forkPath, upstreamCommit.hash);
        onStep?.('synced', `${label} (staged, commit to finish)`);
      } else {
        // Truly nothing changed - clean up merge state
        await mergeAbort(forkPath);
        onStep?.('up to date', 'no upstream changes to sync');
      }

      return {
        success: remainingConflicts.length === 0,
        files: analyzedFiles,
        summary,
        worktreePath: forkPath,
        conflicts: remainingConflicts,
        upstreamBranch: config.settings.upstreamBranch,
        upstreamGitHubUrl: upstreamGitHubUrl ?? undefined,
        forkGitHubUrl: forkGitHubUrl ?? undefined,
        upstreamCommit,
      };
    } else {
      // ANALYZE MODE: Use worktree to preview changes without affecting fork

      // Create worktree in temp directory (invisible to VSCode)
      onProgress?.(`creating worktree in temp directory...`);
      await createWorktree(forkPath, worktreePath, 'HEAD');
      onStep?.('worktree created', worktreePath);

      // Perform merge in worktree (always real merge, never --squash, for correct 3-way)
      onProgress?.('performing merge in worktree...');
      await merge(worktreePath, upstreamRef, { noCommit: true, noEdit: true });
      onStep?.('merge complete', 'upstream merged into worktree');

      // Analyze all files
      onProgress?.('analyzing files...');
      const analyzedFiles = await analyzeFiles(worktreePath, forkPath, upstreamRef, mergeBase, config, onProgress);

      // Enrich files with change dates and commit hashes (cached lookup for non-identical files)
      const forkInfo = await getFileChangeInfo(forkPath, mergeBase, 'HEAD');
      const upstreamInfo = await getFileChangeInfo(forkPath, mergeBase, upstreamRef);
      for (const file of analyzedFiles) {
        if (file.status !== 'identical') {
          // Use fork info for ahead/drifted, upstream info for behind, most recent for diverged
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
            // For diverged/pinned: store both fork and upstream info
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

      onStep?.('analysis complete', `${analyzedFiles.length} files analyzed, dry run — no changes applied`);

      const summary = calculateSummary(analyzedFiles);

      // Cleanup worktree
      onProgress?.('cleaning up worktree...');
      await cleanupWorktree(forkPath, worktreePath);

      // For analyze mode, count diverged files as potential conflicts
      const potentialConflicts = analyzedFiles.filter((f) => f.status === 'diverged').map((f) => f.path);

      return {
        success: true,
        files: analyzedFiles,
        summary,
        worktreePath,
        conflicts: potentialConflicts,
        upstreamBranch: config.settings.upstreamBranch,
        upstreamGitHubUrl: upstreamGitHubUrl ?? undefined,
        forkGitHubUrl: forkGitHubUrl ?? undefined,
        upstreamCommit,
      };
    }
  } catch (error) {
    // Clean up on error
    await cleanupWorktree(forkPath, worktreePath);
    throw error;
  }
}
