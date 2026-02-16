/**
 * Cleanup utilities for sync CLI v2.
 *
 * Handles worktree cleanup and signal handlers for graceful abort.
 * Uses a temp directory outside the repo so worktree doesn't appear in VSCode.
 */

import { existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import pc from 'picocolors';
import { listWorktrees, mergeAbort, removeWorktree } from './git';

/** Worktree directory prefix in system temp */
const WORKTREE_PREFIX = 'cella-sync-';

/** Get the worktree path in system temp directory (invisible to VSCode) */
export function getWorktreePath(repoPath: string): string {
  // Use repo name in temp path for uniqueness
  const repoName = basename(repoPath);
  return join(tmpdir(), `${WORKTREE_PREFIX}${repoName}`);
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
export function unregisterWorktree(): void {
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
 * Check for leftover worktree from previous interrupted run.
 */
export async function detectLeftoverWorktree(repoPath: string): Promise<boolean> {
  const worktreePath = getWorktreePath(repoPath);
  return existsSync(worktreePath);
}

/**
 * Clean up any leftover worktrees.
 */
export async function cleanupLeftoverWorktrees(repoPath: string): Promise<void> {
  const worktreePath = getWorktreePath(repoPath);

  if (existsSync(worktreePath)) {
    await cleanupWorktree(repoPath, worktreePath);
  }

  // Also prune any orphaned git worktree references
  const worktrees = await listWorktrees(repoPath);
  for (const wt of worktrees) {
    if (wt.includes(WORKTREE_PREFIX) && !existsSync(wt)) {
      await removeWorktree(repoPath, wt);
    }
  }
}

/**
 * Handle abort signal (Ctrl+C).
 */
async function handleAbort(signal: string): Promise<void> {
  console.info();
  console.info(`${pc.yellow('⚠')} Interrupted (${signal}) - cleaning up...`);

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

/**
 * Run a function with automatic cleanup on error.
 */
export async function withCleanup<T>(repoPath: string, worktreePath: string, fn: () => Promise<T>): Promise<T> {
  registerWorktree(repoPath, worktreePath);
  registerSignalHandlers();

  try {
    return await fn();
  } catch (error) {
    // Clean up on error
    await cleanupWorktree(repoPath, worktreePath);
    throw error;
  }
}
