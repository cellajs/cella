/**
 * Cleanup utilities for sync CLI v2.
 *
 * Handles worktree cleanup and signal handlers for graceful abort.
 * Uses a temp directory outside the repo so worktree doesn't appear in VSCode.
 */

import { existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import process from 'node:process';
import pc from './colors';
import { warningMark } from './display';
import { createWorktree, listWorktrees, mergeAbort, removeWorktree } from './git';

/**
 * Managed worktree kinds and their system-temp directory prefixes.
 *
 * - `sync`: temporary merge preview worktree. Registered for signal cleanup and
 *   removed when the process exits.
 * - `view`: persistent "upstream view" worktree backing VS Code diff/open links.
 *   Must outlive the process, so it is refreshed (removed + recreated) on the next
 *   run instead of being cleaned up on exit.
 */
const WORKTREE_PREFIXES = {
  sync: 'cella-sync-',
  view: 'cella-view-',
} as const;

type WorktreeKind = keyof typeof WORKTREE_PREFIXES;

/** Build the system-temp worktree path for a kind, keyed by repo name for uniqueness. */
function buildWorktreePath(kind: WorktreeKind, repoPath: string): string {
  return join(tmpdir(), `${WORKTREE_PREFIXES[kind]}${basename(repoPath)}`);
}

/** Get the temporary sync worktree path in system temp directory (invisible to VSCode). */
export function getWorktreePath(repoPath: string): string {
  return buildWorktreePath('sync', repoPath);
}

/** Get the persistent upstream-view worktree path in system temp. */
export function getViewWorktreePath(repoPath: string): string {
  return buildWorktreePath('view', repoPath);
}

/**
 * Refresh the persistent "upstream view" worktree used for VS Code diffs.
 *
 * Unlike the sync worktree, this one must survive process exit so asynchronous
 * `code --diff` invocations and copyable diff commands printed by the CLI still
 * point at valid files after the process returns. It is therefore NOT registered
 * for signal cleanup. Instead, each run removes the previous worktree and
 * recreates it at the current upstream ref, so a leftover is simply cleaned up
 * when the next process starts.
 *
 * @returns Absolute path to the checked-out upstream worktree.
 */
export async function refreshViewWorktree(repoPath: string, upstreamRef: string): Promise<string> {
  const viewPath = getViewWorktreePath(repoPath);

  // Remove any leftover from a previous run before recreating at the current ref.
  await removeWorktree(repoPath, viewPath);
  if (existsSync(viewPath)) {
    rmSync(viewPath, { recursive: true, force: true });
  }

  await createWorktree(repoPath, viewPath, upstreamRef);
  return viewPath;
}

/** Track if cleanup is registered */
let cleanupRegistered = false;

/** Track current worktree for cleanup */
let currentWorktreePath: string | null = null;
let currentRepoPath: string | null = null;

/**
 * Register a worktree for cleanup on exit/abort.
 */
export function registerWorktree(repoPath: string, worktreePath: string): void {
  currentRepoPath = repoPath;
  currentWorktreePath = worktreePath;
}

/**
 * Unregister the worktree (call after successful cleanup).
 */
function unregisterWorktree(): void {
  currentRepoPath = null;
  currentWorktreePath = null;
}

/**
 * Clean up the worktree directory.
 */
export async function cleanupWorktree(repoPath: string, worktreePath: string): Promise<void> {
  // Try git worktree remove first
  await removeWorktree(repoPath, worktreePath);

  // Force remove directory if it still exists
  if (existsSync(worktreePath)) {
    rmSync(worktreePath, { recursive: true, force: true });
  }

  unregisterWorktree();
}

/**
 * Clean up any leftover worktrees from a previous (interrupted) run.
 * No-op when no leftover sync worktree exists (the common case).
 */
export async function cleanupLeftoverWorktrees(repoPath: string): Promise<void> {
  const worktreePath = getWorktreePath(repoPath);
  if (!existsSync(worktreePath)) return;

  await cleanupWorktree(repoPath, worktreePath);

  // Also prune any orphaned git worktree references for our managed prefixes.
  const prefixes = Object.values(WORKTREE_PREFIXES);
  const worktrees = await listWorktrees(repoPath);
  for (const wt of worktrees) {
    if (prefixes.some((prefix) => wt.includes(prefix)) && !existsSync(wt)) {
      await removeWorktree(repoPath, wt);
    }
  }
}

/**
 * Handle abort signal (Ctrl+C).
 */
async function handleAbort(signal: string): Promise<void> {
  console.info();
  console.info(`${warningMark} Interrupted (${signal}) - cleaning up...`);

  if (currentRepoPath && currentWorktreePath) {
    try {
      // Try to abort any in-progress merge in the worktree
      await mergeAbort(currentWorktreePath);
    } catch {
      // Ignore - merge may not be in progress
    }

    try {
      await cleanupWorktree(currentRepoPath, currentWorktreePath);
      console.info(`${pc.green('✓')} no changes were made to your repository.`);
    } catch (error) {
      console.error(
        `${pc.red('✗')} failed to clean up worktree: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    }
  }

  process.exit(1);
}

/**
 * Register signal handlers for graceful cleanup.
 */
export function registerSignalHandlers(): void {
  if (cleanupRegistered) return;

  process.on('SIGINT', () => handleAbort('SIGINT'));
  process.on('SIGTERM', () => handleAbort('SIGTERM'));

  cleanupRegistered = true;
}
