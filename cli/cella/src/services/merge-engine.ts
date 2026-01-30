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
  getFileChangeInfo,
  getFileChanges,
  getFileHashesAtRef,
  getMergeBase,
  getRemoteUrl,
  gitRm,
  merge,
  restoreToHead,
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
 * Performs merge in fork, analyzes files, and resolves them.
 * Fork is left in merge state with MERGE_HEAD for IDE 3-way merge.
 */
async function applyDirectMerge(
  forkPath: string,
  upstreamRef: string,
  mergeBaseRef: string,
  config: RuntimeConfig,
  onProgress?: ProgressCallback,
): Promise<{ resolved: number; remainingConflicts: string[]; analyzedFiles: AnalyzedFile[] }> {
  // Start real merge in fork
  onProgress?.('starting merge in fork...');
  const squash = config.settings.mergeStrategy === 'squash';
  await merge(forkPath, upstreamRef, { noCommit: true, noEdit: true, squash });

  // Analyze files post-merge
  onProgress?.('analyzing files...');
  const analyzedFiles = await analyzeFiles(forkPath, forkPath, upstreamRef, mergeBaseRef, config, onProgress);

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
      }
      resolved++;
      continue;
    }

    if (pinned) {
      onProgress?.(`→ ${filePath}: keeping fork (pinned)`);
      await restoreToHead(forkPath, filePath);
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
      }
      // If file exists in both, merge already applied upstream changes
      resolved++;
      continue;
    }

    if (status === 'deleted') {
      if (await fileExistsInWorktree(forkPath, filePath)) {
        await gitRm(forkPath, filePath);
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

  // Get only files that changed between base and upstream
  const upstreamChanges = await getFileChanges(forkPath, mergeBaseRef, upstreamRef);
  // Get only files that changed between base and fork
  const forkChanges = await getFileChanges(forkPath, mergeBaseRef, 'HEAD');

  // Combined set of all files (for completeness, but we'll only analyze non-identical)
  const allFiles = new Set([...forkHashes.keys(), ...upstreamHashes.keys()]);

  // Files that actually need analysis (changed somewhere)
  const changedFiles = new Set([...upstreamChanges.keys(), ...forkChanges.keys()]);

  onProgress?.(
    `analyzing ${changedFiles.size} changed files (${allFiles.size - changedFiles.size} identical skipped)...`,
  );

  const analyzedFiles: AnalyzedFile[] = [];
  let processed = 0;

  for (const filePath of allFiles) {
    const inFork = forkHashes.has(filePath);
    const inUpstream = upstreamHashes.has(filePath);

    const fileIsIgnored = isIgnored(filePath, config);
    const fileIsPinned = isPinned(filePath, config);

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
        // Fork-only file (never existed upstream)
        status = 'ahead';
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
    drifted: 0,
    behind: 0,
    diverged: 0,
    pinned: 0,
    ignored: 0,
    deleted: 0,
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

    // Get merge base for analysis (need it before showing commit count)
    const mergeBase = await getMergeBase(forkPath, 'HEAD', upstreamRef);

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
      const synced = summary.behind + summary.diverged;
      const mergeType = config.settings.mergeStrategy === 'squash' ? 'squash merge' : 'merge';

      if (remainingConflicts.length > 0) {
        onStep?.(`${mergeType} in progress`, `${remainingConflicts.length} conflicts to resolve in IDE`);
      } else if (synced > 0) {
        onStep?.('synced', `${synced} files from upstream`);
      } else {
        onStep?.('up to date', 'no upstream changes to sync');
      }

      return {
        success: remainingConflicts.length === 0,
        files: analyzedFiles,
        summary,
        worktreePath: forkPath, // No worktree used
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

      // Perform merge in worktree
      onProgress?.('performing merge in worktree...');
      const squash = config.settings.mergeStrategy === 'squash';
      await merge(worktreePath, upstreamRef, { noCommit: true, noEdit: true, squash });
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

      onStep?.('analysis complete', `${analyzedFiles.length} files analyzed`);

      const summary = calculateSummary(analyzedFiles);

      // Cleanup worktree
      onProgress?.('cleaning up worktree...');
      await cleanupWorktree(forkPath, worktreePath);

      // For analyze mode, count diverged files as potential conflicts
      const potentialConflicts = analyzedFiles.filter((f) => f.status === 'diverged').map((f) => f.path);

      onStep?.('analysis complete', 'dry run, no changes applied');

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
