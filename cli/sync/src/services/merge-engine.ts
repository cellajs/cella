/**
 * Merge Engine for sync CLI v2.
 *
 * Core worktree-based merge approach:
 * 1. Create worktree in temp directory (invisible to VSCode)
 * 2. Merge upstream in worktree
 * 3. Resolve conflicts (pinned = ours, ignored = delete)
 * 4. For analyze: show results, cleanup
 * 5. For sync: copy changes back to main repo for staging
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type {
  AnalysisSummary,
  AnalyzedFile,
  CellaSyncConfig,
  FileStatus,
  MergeResult,
  RuntimeConfig,
} from '../config/types';
import {
  cleanupLeftoverWorktrees,
  cleanupWorktree,
  detectLeftoverWorktree,
  getWorktreePath,
  registerWorktree,
} from '../utils/cleanup';
import {
  addAll,
  createWorktree,
  ensureRemote,
  fetch,
  getCommitInfo,
  getConflictedFiles,
  getFileChanges,
  getFileHashesAtRef,
  getMergeBase,
  listFilesAtRef,
  merge,
  removeFile,
  resolveOurs,
} from '../utils/git';
import { findIgnoredFiles, isIgnored, isPinned } from '../utils/overrides';

/** Progress callback type - receives message and optional detail for sub-line */
export type ProgressCallback = (message: string, detail?: string) => void;

/** Step completion callback - marks a step as done with optional detail */
export type StepCallback = (label: string, detail?: string) => void;

/**
 * Apply worktree merge result to the fork repository.
 *
 * Copies changed files from worktree to fork, leaving them staged for commit.
 * Deletes files that were removed in the merge.
 */
async function applyWorktreeToFork(
  worktreePath: string,
  forkPath: string,
  analyzedFiles: AnalyzedFile[],
): Promise<void> {
  const { copyFileSync, mkdirSync, rmSync } = await import('node:fs');
  const { dirname } = await import('node:path');

  // Only process files that actually changed
  const filesToSync = analyzedFiles.filter(
    (f) => f.status !== 'identical' && f.status !== 'ahead' && f.status !== 'ignored',
  );

  for (const file of filesToSync) {
    const sourcePath = join(worktreePath, file.path);
    const destPath = join(forkPath, file.path);

    if (file.status === 'deleted' || !existsSync(sourcePath)) {
      // File was deleted in merge - delete from fork if exists
      if (existsSync(destPath)) {
        rmSync(destPath, { force: true });
      }
    } else {
      // Copy file from worktree to fork
      mkdirSync(dirname(destPath), { recursive: true });
      copyFileSync(sourcePath, destPath);
    }
  }
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
  config: CellaSyncConfig,
  onProgress?: ProgressCallback,
): Promise<AnalyzedFile[]> {
  onProgress?.('Collecting file hashes (batch)...');

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
    `Analyzing ${changedFiles.size} changed files (${allFiles.size - changedFiles.size} identical skipped)...`,
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
      onProgress?.(`Analyzing ${processed}/${changedFiles.size} changed files...`);
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
      // Fork-only file
      status = 'ahead';
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
 * Handle post-merge conflict resolution.
 */
async function resolveConflicts(
  worktreePath: string,
  config: CellaSyncConfig,
  onProgress?: ProgressCallback,
): Promise<string[]> {
  const conflicts = await getConflictedFiles(worktreePath);
  const unresolvedConflicts: string[] = [];

  for (const filePath of conflicts) {
    const fileIsIgnored = isIgnored(filePath, config);
    const fileIsPinned = isPinned(filePath, config);

    if (fileIsIgnored) {
      // Ignored files: use ours (fork version) or remove if fork didn't have it
      onProgress?.(`→ ${filePath}: removing (ignored)`);
      await removeFile(worktreePath, filePath);
    } else if (fileIsPinned) {
      // Pinned files: use ours (fork version)
      onProgress?.(`→ ${filePath}: keeping fork (pinned)`);
      await resolveOurs(worktreePath, filePath);
    } else {
      // Not protected: leave conflict for manual resolution
      unresolvedConflicts.push(filePath);
    }
  }

  return unresolvedConflicts;
}

/**
 * Remove all ignored files from the worktree.
 *
 * After merge, scan the worktree and delete any files matching ignored patterns.
 * This ensures ignored files from upstream don't pollute the fork.
 */
async function removeIgnoredFilesFromWorktree(
  worktreePath: string,
  config: CellaSyncConfig,
  onProgress?: ProgressCallback,
): Promise<string[]> {
  const removed: string[] = [];

  // Get all files currently in the worktree
  const worktreeFiles = await listFilesAtRef(worktreePath, 'HEAD');

  // Find all ignored files
  const ignoredFiles = findIgnoredFiles(worktreeFiles, config);

  for (const filePath of ignoredFiles) {
    const fullPath = join(worktreePath, filePath);
    if (existsSync(fullPath)) {
      onProgress?.(`→ ${filePath}: removing (ignored)`);
      await removeFile(worktreePath, filePath);
      removed.push(filePath);
    }
  }

  return removed;
}

/**
 * Main merge engine entry point.
 *
 * Creates worktree, performs merge, resolves conflicts,
 * and optionally applies result to main repo.
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
    onProgress?.('Cleaning up leftover worktree from previous run...');
    await cleanupLeftoverWorktrees(forkPath);
  }

  // Register worktree for cleanup on abort
  registerWorktree(forkPath, worktreePath);

  try {
    // Setup upstream remote
    onProgress?.('Setting up upstream remote...');
    const remoteName = config.settings.upstreamRemoteName || 'cella-upstream';
    await ensureRemote(forkPath, remoteName, config.settings.upstreamUrl);
    onStep?.('Remote configured', `${remoteName} → ${config.settings.upstreamUrl}`);

    // Fetch upstream
    onProgress?.(`Fetching upstream (${remoteName})...`);
    await fetch(forkPath, remoteName);

    // Get upstream commit info
    const upstreamCommit = await getCommitInfo(forkPath, upstreamRef);
    onStep?.('Fetched upstream', `${upstreamCommit.hash.slice(0, 7)} "${upstreamCommit.message}"`);

    // Get merge base for analysis
    const mergeBase = await getMergeBase(forkPath, 'HEAD', upstreamRef);

    // Create worktree in temp directory (invisible to VSCode)
    onProgress?.(`Creating worktree in temp directory...`);
    await createWorktree(forkPath, worktreePath, 'HEAD');
    onStep?.('Worktree created', worktreePath);

    // Perform merge in worktree
    onProgress?.('Performing merge...');
    const mergeResult = await merge(worktreePath, upstreamRef, { noCommit: true, noEdit: true });

    // Handle conflicts
    let conflicts: string[] = [];
    if (!mergeResult.success) {
      onProgress?.('Resolving conflicts...');
      conflicts = await resolveConflicts(worktreePath, config, onProgress);
    }
    onStep?.('Merge complete', conflicts.length > 0 ? `${conflicts.length} unresolved conflicts` : 'No conflicts');

    // Remove all ignored files from worktree (after merge)
    onProgress?.('Removing ignored files from merge result...');
    await removeIgnoredFilesFromWorktree(worktreePath, config, onProgress);

    // Analyze all files
    onProgress?.('Analyzing files...');
    const analyzedFiles = await analyzeFiles(worktreePath, forkPath, upstreamRef, mergeBase, config, onProgress);
    onStep?.('Analysis complete', `${analyzedFiles.length} files analyzed`);

    // Mark files with conflicts
    for (const file of analyzedFiles) {
      if (conflicts.includes(file.path)) {
        file.hasConflict = true;
      }
    }

    const summary = calculateSummary(analyzedFiles);

    // Apply or discard
    if (apply) {
      onProgress?.('Applying changes to repository...');
      await addAll(worktreePath);
      await applyWorktreeToFork(worktreePath, forkPath, analyzedFiles);
      const changedCount = summary.behind + summary.diverged;
      onStep?.('Changes applied', `${changedCount} files updated`);
      onProgress?.('Cleaning up worktree...');
      await cleanupWorktree(forkPath, worktreePath);
      onStep?.('Worktree cleaned up');
    } else {
      onProgress?.('Cleaning up worktree (dry run)...');
      await cleanupWorktree(forkPath, worktreePath);
      onStep?.('Worktree cleaned up', 'Dry run, no changes applied');
    }

    return {
      success: conflicts.length === 0,
      files: analyzedFiles,
      summary,
      worktreePath,
      conflicts,
      upstreamCommit,
    };
  } catch (error) {
    // Clean up on error
    await cleanupWorktree(forkPath, worktreePath);
    throw error;
  }
}
