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

import type { AnalysisSummary, AnalyzedFile, MergeResult, RuntimeConfig } from '../config/types';
import {
  cleanupLeftoverWorktrees,
  cleanupWorktree,
  detectLeftoverWorktree,
  getWorktreePath,
  refreshViewWorktree,
  registerWorktree,
} from '../utils/cleanup';
import { resolveUpstream } from '../utils/config';
import { formatFetchedUpstreamDetail, formatMergeInProgressDetail } from '../utils/display';
import {
  batchGitRm,
  batchRestoreToHead,
  batchUnstageFiles,
  checkoutFromRef,
  countCommitsBetween,
  createWorktree,
  ensureRemote,
  fetch,
  fetchUpstreamTags,
  fileExistsAtRef,
  fileExistsInWorktree,
  getCommitInfo,
  getConflictedFiles,
  getEffectiveMergeBase,
  getMergeBase,
  getRemoteUrl,
  getStagedNewFiles,
  gitMv,
  gitRm,
  listCommitsBetween,
  merge,
  mergeAbort,
  removeFileFromWorktree,
  removeMergeHead,
  resolveLatestReleaseTag,
  resolvePinnedReleaseTag,
  restoreToHead,
  storeLastSyncRef,
} from '../utils/git';
import { isIgnored, isPinnedForSync } from '../utils/overrides';
import { type AnalyzePredicates, analyzeRefs, enrichChangeInfo } from './analyze-core';

/** Progress callback type - receives message and optional detail for sub-line */
type ProgressCallback = (message: string, detail?: string) => void;

/** Step completion callback - marks a step as done with optional detail */
type StepCallback = (label: string, detail?: string) => void;

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

/** Build analyzer predicates for the sync direction (local = fork, incoming = upstream). */
function syncPredicates(config: RuntimeConfig): AnalyzePredicates {
  return {
    isIgnored: (path) => isIgnored(path, config),
    isPinned: (path) => isPinnedForSync(path, config, config.unpinned),
    hard: config.hard,
  };
}

/**
 * Apply merge directly to fork with pre-analysis.
 *
 * Strategy: analyze BEFORE merge (uses git refs only, invisible to IDE),
 * then merge + immediate batch resolution to minimize working tree flickering.
 *
 * 1. Pre-analyze using git refs (no working tree changes)
 * 2. Collect batch resolution plan (which files to restore/remove)
 * 3. Start real merge in fork (git merge --no-commit)
 * 4. Immediately batch-restore pinned/ignored files (single git command)
 * 5. Apply remaining individual resolutions
 * 6. Leave fork in merge state for IDE 3-way conflict resolution
 */
async function applyDirectMerge(
  forkPath: string,
  upstreamRef: string,
  mergeBaseRef: string,
  config: RuntimeConfig,
  onProgress?: ProgressCallback,
): Promise<{
  resolved: number;
  remainingConflicts: string[];
  analyzedFiles: AnalyzedFile[];
  autoMergedFiles: string[];
}> {
  // Phase 1: Pre-analyze using git refs (invisible to IDE).
  // analyzeRefs only uses git plumbing (ls-tree, diff-tree) on refs,
  // not the working tree, so results are identical before or after merge.
  onProgress?.('analyzing files...');
  const analyzedFiles = await analyzeRefs(
    forkPath,
    'HEAD',
    upstreamRef,
    mergeBaseRef,
    syncPredicates(config),
    onProgress,
  );

  // Phase 2: Collect batch resolution plan for immediate post-merge application.
  // These files will be restored to HEAD in a single git command right after merge,
  // preventing the IDE from seeing upstream changes to pinned/ignored files.
  const batchRestorePaths: string[] = [];
  const batchRemovePaths: string[] = [];

  for (const file of analyzedFiles) {
    const { path: filePath, status, isPinned: pinned, isIgnored: ignored, existsInFork } = file;
    if (status === 'identical' || status === 'ahead') continue;

    if (ignored && existsInFork) {
      batchRestorePaths.push(filePath);
    } else if (ignored && !existsInFork) {
      batchRemovePaths.push(filePath);
    } else if (pinned && !file.renamedFrom && existsInFork) {
      batchRestorePaths.push(filePath);
    } else if (pinned && !file.renamedFrom && !existsInFork) {
      // Pinned file doesn't exist in fork — remove from merge to keep fork's state (deleted)
      batchRemovePaths.push(filePath);
    }
  }

  // Phase 3: Start real merge in fork (always real merge, never --squash).
  // Squash strategy is handled post-merge by removing MERGE_HEAD before auto-commit,
  // which preserves correct 3-way merge behavior and merge-base ancestry.
  onProgress?.('starting merge in fork...');
  await merge(forkPath, upstreamRef, { noCommit: true, noEdit: true });

  // Phase 4: Immediately batch-restore pinned/ignored files.
  // Single git command restores all files at once, minimizing the window
  // where the IDE sees upstream changes to protected files.
  if (batchRestorePaths.length > 0) {
    onProgress?.(`batch restoring ${batchRestorePaths.length} pinned/ignored files...`);
    await batchRestoreToHead(forkPath, batchRestorePaths);
  }
  if (batchRemovePaths.length > 0) {
    onProgress?.(`batch removing ${batchRemovePaths.length} ignored files...`);
    await batchGitRm(forkPath, batchRemovePaths);
    for (const filePath of batchRemovePaths) {
      await removeFileFromWorktree(forkPath, filePath);
    }
  }

  // Phase 5: Apply remaining individual resolutions.
  // Pinned/ignored already handled in batch above — skip them here.
  let resolved = batchRestorePaths.length + batchRemovePaths.length;

  for (const file of analyzedFiles) {
    const { path: filePath, status, isPinned: pinned, isIgnored: ignored, existsInFork } = file;

    if (status === 'identical' || status === 'ahead') {
      continue;
    }

    // Skip files already handled in batch
    if (ignored) continue;
    if (pinned && !file.renamedFrom) continue;

    if (pinned && file.renamedFrom) {
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
    }
  }

  // Handle remaining git conflicts (only auto-resolve ignored/pinned)
  const gitConflicts = await getConflictedFiles(forkPath);
  for (const filePath of gitConflicts) {
    const fileIsIgnored = isIgnored(filePath, config);
    const fileIsPinned = isPinnedForSync(filePath, config, config.unpinned);

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
      const existsInFork = await fileExistsAtRef(forkPath, 'HEAD', filePath);
      if (existsInFork) {
        onProgress?.(`→ ${filePath}: keeping fork (pinned conflict)`);
        await restoreToHead(forkPath, filePath);
      } else {
        onProgress?.(`→ ${filePath}: removing (pinned conflict, not in fork)`);
        await gitRm(forkPath, filePath);
        await removeFileFromWorktree(forkPath, filePath);
      }
      resolved++;
    }
    // Non-ignored, non-pinned conflicts are left for user in IDE
  }

  // Get remaining conflicts (these have markers for IDE)
  const remainingConflicts = await getConflictedFiles(forkPath);
  const remainingConflictSet = new Set(remainingConflicts);
  const autoMergedFiles = analyzedFiles
    .filter((file) => file.status === 'diverged' && !remainingConflictSet.has(file.path))
    .map((file) => file.path);

  // Phase 6: Safety net — clean up any ignored files still staged after merge.
  // During a merge, batchGitRm can silently fail on newly-added files, leaving
  // them as "Added in index, Deleted from working tree" (AD status). This catches
  // any ignored files that slipped through the earlier resolution phases.
  const stagedNewFiles = await getStagedNewFiles(forkPath);
  const staleIgnoredFiles = stagedNewFiles.filter((f) => isIgnored(f, config));
  if (staleIgnoredFiles.length > 0) {
    onProgress?.(`cleaning up ${staleIgnoredFiles.length} ignored files still in index...`);
    await batchUnstageFiles(forkPath, staleIgnoredFiles);
    for (const filePath of staleIgnoredFiles) {
      await removeFileFromWorktree(forkPath, filePath);
    }
  }

  return { resolved, remainingConflicts, analyzedFiles, autoMergedFiles };
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
  const { forkPath } = config;
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
    const { remoteName, track: configTrack, tag, branchRef } = resolveUpstream(config.settings);
    // A per-run --track flag (config.track) overrides the configured tracking mode.
    const track = config.track ?? configTrack;
    await ensureRemote(forkPath, remoteName, config.settings.upstreamUrl);

    // Fetch upstream (branches, plus release tags into a fork-safe namespace).
    onProgress?.(`fetching upstream (${remoteName})...`);
    await fetch(forkPath, remoteName);

    // Resolve the concrete ref to merge from. Release tracking (default) syncs to a
    // published release tag; branch tracking follows the upstream branch tip.
    let upstreamRef = branchRef;
    let releaseTag: string | undefined;
    if (track === 'release') {
      await fetchUpstreamTags(forkPath, remoteName);
      if (tag) {
        upstreamRef = await resolvePinnedReleaseTag(forkPath, remoteName, tag);
        releaseTag = tag;
      } else {
        const latest = await resolveLatestReleaseTag(forkPath, remoteName);
        if (!latest) {
          throw new Error(
            `no upstream releases (v*) found on '${remoteName}'. Set upstreamTrack: 'branch' to follow ${branchRef}, ` +
              `or check that ${config.settings.upstreamUrl} publishes release tags.`,
          );
        }
        upstreamRef = latest.ref;
        releaseTag = latest.tag;
      }
    }

    // Expose the resolved ref to downstream steps (packages/analyze read config.upstreamRef
    // after the engine runs). The static fallback set at CLI parse time is the branch tip.
    config.upstreamRef = upstreamRef;
    onStep?.('remote configured', `${releaseTag ?? upstreamRef} → ${config.settings.upstreamUrl}`);

    // Get GitHub base URLs for commit links
    const upstreamGitHubUrl = getGitHubBaseUrl(config.settings.upstreamUrl);
    const forkOriginUrl = await getRemoteUrl(forkPath, 'origin');
    const forkGitHubUrl = forkOriginUrl ? getGitHubBaseUrl(forkOriginUrl) : null;

    // Get effective merge base (handles stale base from previous squash syncs).
    // --hard and --unpinned use the natural merge-base instead, resurfacing the
    // full upstream history so previously-hidden drift/pins reappear consistently.
    const aggressive = config.hard === true || config.unpinned === true;
    const mergeBase = aggressive
      ? await getMergeBase(forkPath, 'HEAD', upstreamRef)
      : (await getEffectiveMergeBase(forkPath, 'HEAD', upstreamRef)).base;

    // Get upstream commit info and count commits since merge-base
    const upstreamCommit = await getCommitInfo(forkPath, upstreamRef);
    const commitCount = await countCommitsBetween(forkPath, mergeBase, upstreamRef);
    const commitListMax = 50;
    const commitSkip = commitCount > commitListMax ? commitCount - commitListMax : 0;
    const upstreamCommits =
      commitCount > 0
        ? await listCommitsBetween(forkPath, mergeBase, upstreamRef, {
            oldestFirst: true,
            skip: commitSkip,
            limit: commitListMax,
          })
        : [];

    const commitInfo = formatFetchedUpstreamDetail(commitCount, upstreamCommits, upstreamGitHubUrl ?? undefined);

    onStep?.('fetched upstream', commitInfo);

    // For sync mode, we'll do the merge directly in fork
    // For analyze mode, we use a worktree to preview changes
    if (apply) {
      // SYNC MODE: Do merge, analysis, and resolution directly in fork
      const {
        resolved: _resolved,
        remainingConflicts,
        analyzedFiles,
        autoMergedFiles,
      } = await applyDirectMerge(forkPath, upstreamRef, mergeBase, config, onProgress);

      const summary = calculateSummary(analyzedFiles);
      const synced = summary.behind + summary.diverged + summary.renamed;
      // Default to squash: forks on the release-please flow squash-merge the sync PR
      // into a linear-history `main` anyway, so single-parent sync commits are the norm.
      const isSquash = (config.settings.mergeStrategy ?? 'squash') === 'squash';

      // Count total resolved changes (includes ignored/pinned resolutions)
      const totalResolved = synced + summary.ignored + summary.pinned;

      if (remainingConflicts.length > 0) {
        // Conflicts: leave MERGE_HEAD intact for IDE 3-way merge resolution.
        // When user commits, it becomes a merge commit (self-healing ancestry).
        await storeLastSyncRef(forkPath, upstreamCommit.hash);
        // Materialize the upstream view worktree so auto-merged files get exact
        // `code --diff` commands (byte-consistent with the fetched upstream ref).
        const upstreamViewPath = await refreshViewWorktree(forkPath, upstreamRef);
        onStep?.(
          'merge in progress',
          formatMergeInProgressDetail(
            remainingConflicts.length,
            autoMergedFiles,
            {
              upstreamGitHubUrl: upstreamGitHubUrl ?? undefined,
              upstreamBranch: config.settings.upstreamBranch ?? 'main',
              fileLinkMode: config.settings.fileLinkMode,
              upstreamViewPath,
              forkPath,
            },
            100,
          ),
        );
      } else if (totalResolved > 0) {
        const label = synced > 0 ? `${synced} files from upstream` : 'upstream changes';
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
        upstreamBranch: config.settings.upstreamBranch ?? 'main',
        upstreamRef,
        upstreamTag: releaseTag,
        upstreamGitHubUrl: upstreamGitHubUrl ?? undefined,
        forkGitHubUrl: forkGitHubUrl ?? undefined,
        upstreamCommit,
        upstreamCommits,
        autoMergedFiles,
      };
    }
    // ANALYZE MODE: Use worktree to preview changes without affecting fork

    // Create worktree in temp directory (invisible to VSCode)
    onProgress?.('creating worktree in temp directory...');
    await createWorktree(forkPath, worktreePath, 'HEAD');
    onStep?.('worktree created', worktreePath);

    // Perform merge in worktree (always real merge, never --squash, for correct 3-way)
    onProgress?.('performing merge in worktree...');
    await merge(worktreePath, upstreamRef, { noCommit: true, noEdit: true });
    onStep?.('merge complete', 'upstream merged into worktree');

    // Analyze all files
    onProgress?.('analyzing files...');
    const analyzedFiles = await analyzeRefs(
      forkPath,
      'HEAD',
      upstreamRef,
      mergeBase,
      syncPredicates(config),
      onProgress,
    );

    // Enrich files with change dates and commit hashes (cached lookup for non-identical files)
    await enrichChangeInfo(forkPath, analyzedFiles, mergeBase, 'HEAD', upstreamRef);

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
      upstreamBranch: config.settings.upstreamBranch ?? 'main',
      upstreamRef,
      upstreamTag: releaseTag,
      upstreamGitHubUrl: upstreamGitHubUrl ?? undefined,
      forkGitHubUrl: forkGitHubUrl ?? undefined,
      upstreamCommit,
      upstreamCommits,
    };
  } catch (error) {
    // Clean up on error
    await cleanupWorktree(forkPath, worktreePath);
    throw error;
  }
}
