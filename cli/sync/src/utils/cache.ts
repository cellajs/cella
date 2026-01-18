/**
 * In-memory session cache for expensive git operations.
 * Lives only for the duration of a single CLI run - no persistence.
 * This eliminates redundant git calls when the same data is needed multiple times.
 */

import type { CommitEntry, FileEntry } from '#/types';

/** Cache for getGitFileHashes results, keyed by `${repoPath}:${branchName}` */
const fileHashCache = new Map<string, FileEntry[]>();

/** Cache for getFileCommitHistory results, keyed by `${repoPath}:${branchName}:${filePath}` */
const commitHistoryCache = new Map<string, CommitEntry[]>();

/**
 * Generates a cache key for file hash lookups.
 */
export function fileHashCacheKey(repoPath: string, branchName: string): string {
  return `${repoPath}:${branchName}`;
}

/**
 * Generates a cache key for commit history lookups.
 */
export function commitHistoryCacheKey(repoPath: string, branchName: string, filePath: string): string {
  return `${repoPath}:${branchName}:${filePath}`;
}

/**
 * Gets cached file hashes if available.
 */
export function getCachedFileHashes(repoPath: string, branchName: string): FileEntry[] | undefined {
  return fileHashCache.get(fileHashCacheKey(repoPath, branchName));
}

/**
 * Stores file hashes in the session cache.
 */
export function setCachedFileHashes(repoPath: string, branchName: string, entries: FileEntry[]): void {
  fileHashCache.set(fileHashCacheKey(repoPath, branchName), entries);
}

/**
 * Gets cached commit history if available.
 */
export function getCachedCommitHistory(
  repoPath: string,
  branchName: string,
  filePath: string,
): CommitEntry[] | undefined {
  return commitHistoryCache.get(commitHistoryCacheKey(repoPath, branchName, filePath));
}

/**
 * Stores commit history in the session cache.
 */
export function setCachedCommitHistory(
  repoPath: string,
  branchName: string,
  filePath: string,
  commits: CommitEntry[],
): void {
  commitHistoryCache.set(commitHistoryCacheKey(repoPath, branchName, filePath), commits);
}

/**
 * Clears all session caches. Called automatically on CLI exit or can be called manually.
 */
export function clearSessionCache(): void {
  fileHashCache.clear();
  commitHistoryCache.clear();
}
