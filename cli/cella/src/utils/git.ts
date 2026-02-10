/**
 * Git command helpers for sync CLI v2.
 *
 * Provides typed wrappers around common git operations.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/** Options for git command execution */
interface GitCommandOptions {
  /** Skip editor prompts (for merge commits, etc.) */
  skipEditor?: boolean;
  /** Maximum buffer size for stdout (default: 50MB) */
  maxBuffer?: number;
  /** Ignore command errors (return empty string instead of throwing) */
  ignoreErrors?: boolean;
}

/**
 * Executes a git command and returns trimmed stdout.
 *
 * @param args - Git command arguments (e.g., ['status', '--porcelain'])
 * @param cwd - Working directory for the command
 * @param options - Command execution options
 * @returns Trimmed stdout from the command
 */
export async function git(args: string[], cwd: string, options: GitCommandOptions = {}): Promise<string> {
  const env = {
    ...process.env,
    ...(options.skipEditor ? { GIT_EDITOR: 'true' } : {}),
  };

  const maxBuffer = options.maxBuffer ?? 50 * 1024 * 1024; // 50MB default

  try {
    const { stdout } = await execFileAsync('git', args, { cwd, env, maxBuffer });
    return stdout.trim();
  } catch (error) {
    if (options.ignoreErrors) return '';
    throw error;
  }
}

/**
 * Get the current branch name.
 */
export async function getCurrentBranch(cwd: string): Promise<string> {
  return git(['rev-parse', '--abbrev-ref', 'HEAD'], cwd);
}

/**
 * Check if a remote exists.
 */
async function remoteExists(cwd: string, remoteName: string): Promise<boolean> {
  const remotes = await git(['remote'], cwd);
  return remotes.split('\n').includes(remoteName);
}

/**
 * Get the URL of a remote.
 */
export async function getRemoteUrl(cwd: string, remoteName: string): Promise<string | null> {
  try {
    const url = await git(['remote', 'get-url', remoteName], cwd, { ignoreErrors: true });
    return url.trim() || null;
  } catch {
    return null;
  }
}

/**
 * Add a remote if it doesn't exist.
 */
export async function ensureRemote(cwd: string, remoteName: string, url: string): Promise<void> {
  if (await remoteExists(cwd, remoteName)) {
    // Update URL if remote exists
    await git(['remote', 'set-url', remoteName, url], cwd);
  } else {
    await git(['remote', 'add', remoteName, url], cwd);
  }
}

/**
 * Fetch from a remote.
 */
export async function fetch(cwd: string, remoteName: string): Promise<void> {
  await git(['fetch', remoteName], cwd);
}

/**
 * Get the latest commit info from a ref.
 */
export async function getCommitInfo(
  cwd: string,
  ref: string,
): Promise<{ hash: string; message: string; date: string }> {
  const format = '%H%n%s%n%ar'; // hash, subject, relative date
  const output = await git(['log', '-1', '--format=' + format, ref], cwd);
  const [hash, message, date] = output.split('\n');
  return { hash, message, date };
}

/**
 * Count the number of commits between two refs.
 * Returns the number of commits in `toRef` that are not in `fromRef`.
 */
export async function countCommitsBetween(cwd: string, fromRef: string, toRef: string): Promise<number> {
  const output = await git(['rev-list', '--count', `${fromRef}..${toRef}`], cwd);
  return Number.parseInt(output.trim(), 10) || 0;
}

/**
 * File change info with date and commit hash.
 */
export interface FileChangeInfo {
  date: string;
  hash: string;
}

/**
 * Get the relative date and commit hash of the last change for all files in a range.
 * Returns a map of filePath -> { date, hash }.
 * Uses a single git command to get all info efficiently.
 */
export async function getFileChangeInfo(
  cwd: string,
  fromRef: string,
  toRef: string,
): Promise<Map<string, FileChangeInfo>> {
  const info = new Map<string, FileChangeInfo>();

  try {
    // Get all commits in range with their files, dates, and hashes
    // Format: hash, relative date, then list of files changed
    const output = await git(['log', '--name-only', '--format=%h %ar', `${fromRef}..${toRef}`], cwd, {
      ignoreErrors: true,
    });

    if (!output.trim()) return info;

    const lines = output.split('\n');
    let currentHash = '';
    let currentDate = '';

    for (const line of lines) {
      if (!line) continue;

      // Check if this is a hash+date line (starts with short hash)
      const match = line.match(/^([a-f0-9]{7,})\s+(.+)$/);
      if (match) {
        currentHash = match[1];
        currentDate = match[2];
      } else if (currentHash && currentDate && !info.has(line)) {
        // This is a file path - only set if not already set (we want most recent)
        info.set(line, { date: currentDate, hash: currentHash });
      }
    }
  } catch {
    // Ignore errors, return empty map
  }

  return info;
}

/**
 * Check if the working tree is clean (no uncommitted changes).
 */
export async function isClean(cwd: string): Promise<boolean> {
  const status = await git(['status', '--porcelain'], cwd);
  return !status;
}

/**
 * Create a worktree from a commit (detached HEAD).
 * Uses --detach to avoid "branch already checked out" errors.
 */
export async function createWorktree(cwd: string, worktreePath: string, commitRef: string): Promise<void> {
  await git(['worktree', 'add', '--detach', worktreePath, commitRef], cwd);
}

/**
 * Remove a worktree.
 */
export async function removeWorktree(cwd: string, worktreePath: string): Promise<void> {
  await git(['worktree', 'remove', worktreePath, '--force'], cwd, { ignoreErrors: true });
  await git(['worktree', 'prune'], cwd, { ignoreErrors: true });
}

/**
 * List existing worktrees.
 */
export async function listWorktrees(cwd: string): Promise<string[]> {
  const output = await git(['worktree', 'list', '--porcelain'], cwd);
  const lines = output.split('\n');
  const paths: string[] = [];
  for (const line of lines) {
    if (line.startsWith('worktree ')) {
      paths.push(line.slice(9));
    }
  }
  return paths;
}

/**
 * Perform a merge in the current directory.
 */
/**
 * Perform a merge in the current directory.
 * Always uses --no-ff to prevent fast-forward, ensuring HEAD stays in place
 * and MERGE_HEAD is created for proper merge state tracking.
 */
export async function merge(
  cwd: string,
  ref: string,
  options: { noCommit?: boolean; noEdit?: boolean; squash?: boolean } = {},
): Promise<{ success: boolean; conflicts: string[] }> {
  const args = ['merge', '--no-ff', ref];
  if (options.squash) args.push('--squash');
  if (options.noCommit) args.push('--no-commit');
  if (options.noEdit) args.push('--no-edit');

  try {
    await git(args, cwd, { skipEditor: true });
    return { success: true, conflicts: [] };
  } catch (error) {
    // Check for conflicts
    const conflicts = await getConflictedFiles(cwd);
    if (conflicts.length > 0) {
      return { success: false, conflicts };
    }
    throw error;
  }
}

/**
 * Get list of files with merge conflicts.
 */
export async function getConflictedFiles(cwd: string): Promise<string[]> {
  const output = await git(['diff', '--name-only', '--diff-filter=U'], cwd, { ignoreErrors: true });
  if (!output) return [];
  return output.split('\n').filter(Boolean);
}

/**
 * Abort an in-progress merge.
 */
export async function mergeAbort(cwd: string): Promise<void> {
  await git(['merge', '--abort'], cwd, { ignoreErrors: true });
}

/**
 * Check if a file exists at a ref.
 */
export async function fileExistsAtRef(cwd: string, ref: string, filePath: string): Promise<boolean> {
  const result = await git(['ls-tree', '--name-only', ref, '--', filePath], cwd, { ignoreErrors: true });
  return result !== '';
}

/**
 * Checkout a file from a specific ref.
 * Used to restore files from upstream that don't exist in fork.
 */
export async function checkoutFromRef(cwd: string, ref: string, filePath: string): Promise<void> {
  await git(['checkout', ref, '--', filePath], cwd);
}

/**
 * Get the merge base between two refs.
 */
export async function getMergeBase(cwd: string, ref1: string, ref2: string): Promise<string> {
  return git(['merge-base', ref1, ref2], cwd);
}

/** File change status codes from git diff-tree */
export type FileChangeStatus = 'A' | 'D' | 'M' | 'T' | 'R';

/** File change info from git diff-tree */
export interface FileChange {
  status: FileChangeStatus;
  baseHash: string | null;
  targetHash: string | null;
  /** For renames: the original path (before rename) */
  oldPath?: string;
  /** For renames: the new path (after rename) */
  newPath?: string;
}

/**
 * Get files changed between two refs using diff-tree.
 * Returns a map of filePath -> FileChange
 *
 * This is much faster than checking each file individually.
 * Status codes: A=added, D=deleted, M=modified, T=type-changed, R=renamed
 *
 * Uses -M90% to detect renames with 90% similarity threshold.
 * For renames, the map key is the NEW path, with oldPath stored in the value.
 */
export async function getFileChanges(
  cwd: string,
  baseRef: string,
  targetRef: string,
): Promise<Map<string, FileChange>> {
  // Use diff-tree with -M90% to detect renames (90% similarity threshold)
  // Format for non-renames: :oldmode newmode oldhash newhash status\tpath
  // Format for renames: :oldmode newmode oldhash newhash Rxx\toldpath\tnewpath
  const output = await git(['diff-tree', '-r', '-M90%', '--no-commit-id', baseRef, targetRef], cwd, {
    ignoreErrors: true,
  });

  const changes = new Map<string, FileChange>();

  if (!output) return changes;

  for (const line of output.split('\n')) {
    if (!line) continue;

    // Check for rename first (Rxx status with two paths)
    // Format: :100644 100644 abc123... def456... R100 oldpath\tnewpath
    // Note: space after Rxx, then tab between old and new paths
    const renameMatch = line.match(/^:\d+ \d+ ([a-f0-9]+) ([a-f0-9]+) R\d*\s+(.+)\t(.+)$/);
    if (renameMatch) {
      const [, baseHash, targetHash, oldPath, newPath] = renameMatch;
      changes.set(newPath, {
        status: 'R',
        baseHash: baseHash === '0'.repeat(40) ? null : baseHash,
        targetHash: targetHash === '0'.repeat(40) ? null : targetHash,
        oldPath,
        newPath,
      });
      continue;
    }

    // Parse non-rename: :100644 100644 abc123... def456... M\tpath/to/file
    const match = line.match(/^:\d+ \d+ ([a-f0-9]+) ([a-f0-9]+) ([ADMT])\t(.+)$/);
    if (match) {
      const [, baseHash, targetHash, status, filePath] = match;
      changes.set(filePath, {
        status: status as 'A' | 'D' | 'M' | 'T',
        baseHash: baseHash === '0'.repeat(40) ? null : baseHash,
        targetHash: targetHash === '0'.repeat(40) ? null : targetHash,
      });
    }
  }

  return changes;
}

/**
 * Get all file hashes at a ref using ls-tree (batch operation).
 * Returns a Map of filePath -> hash for quick lookups.
 */
export async function getFileHashesAtRef(cwd: string, ref: string): Promise<Map<string, string>> {
  const output = await git(['ls-tree', '-r', ref], cwd);
  const hashes = new Map<string, string>();

  if (!output) return hashes;

  for (const line of output.split('\n')) {
    if (!line) continue;
    // Parse: <mode> <type> <hash>\t<path>
    const match = line.match(/^\d+ \w+ ([a-f0-9]+)\t(.+)$/);
    if (match) {
      const [, hash, filePath] = match;
      hashes.set(filePath, hash);
    }
  }

  return hashes;
}

/**
 * Restore a file to HEAD version (our version during merge).
 * Updates both index and worktree to match HEAD.
 */
export async function restoreToHead(cwd: string, filePath: string): Promise<void> {
  await git(['restore', '--source=HEAD', '--staged', '--worktree', '--', filePath], cwd);
}

/**
 * Remove a file from index with tracked delete (git rm).
 * Records a deletion in the merge result.
 */
export async function gitRm(cwd: string, filePath: string): Promise<void> {
  await git(['rm', '-f', '--', filePath], cwd, { ignoreErrors: true });
}

/**
 * Move/rename a file using git mv.
 * Creates parent directories if needed and preserves git history.
 */
export async function gitMv(cwd: string, oldPath: string, newPath: string): Promise<void> {
  const { mkdir } = await import('node:fs/promises');
  const { join, dirname } = await import('node:path');

  // Ensure parent directory exists for new path
  const newDir = dirname(join(cwd, newPath));
  await mkdir(newDir, { recursive: true });

  await git(['mv', '-f', oldPath, newPath], cwd);
}

/**
 * Check if a file exists in the worktree filesystem.
 */
export async function fileExistsInWorktree(cwd: string, filePath: string): Promise<boolean> {
  const { existsSync } = await import('node:fs');
  const { join } = await import('node:path');
  return existsSync(join(cwd, filePath));
}

/**
 * Remove a file from the worktree filesystem if it exists.
 * Used to clean up files that git rm may not have removed (e.g., after squash merge).
 */
export async function removeFileFromWorktree(cwd: string, filePath: string): Promise<void> {
  const { unlink } = await import('node:fs/promises');
  const { join, dirname } = await import('node:path');
  const fullPath = join(cwd, filePath);
  try {
    await unlink(fullPath);
    // Try to clean up empty parent directories
    await cleanupEmptyParentDirs(cwd, dirname(filePath));
  } catch {
    // File doesn't exist or can't be removed - ignore
  }
}

/**
 * Recursively remove empty parent directories up to (but not including) the root.
 * Stops when encountering a non-empty directory or the root.
 */
async function cleanupEmptyParentDirs(cwd: string, relativePath: string): Promise<void> {
  if (!relativePath || relativePath === '.') return;

  const { rmdir, readdir } = await import('node:fs/promises');
  const { join, dirname } = await import('node:path');

  const fullPath = join(cwd, relativePath);
  try {
    const entries = await readdir(fullPath);
    if (entries.length === 0) {
      await rmdir(fullPath);
      // Recurse to parent
      await cleanupEmptyParentDirs(cwd, dirname(relativePath));
    }
  } catch {
    // Directory doesn't exist, not empty, or can't be removed - stop
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Sync ref tracking & merge-base recovery
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Store the upstream commit hash after a successful sync.
 * Used to recover correct merge-base when squash strategy creates single-parent commits.
 */
export async function storeLastSyncRef(cwd: string, upstreamHash: string): Promise<void> {
  await git(['update-ref', 'refs/cella/last-sync', upstreamHash], cwd);
}

/**
 * Get the stored last-sync upstream ref.
 * Returns null if no previous sync has been recorded.
 */
export async function getStoredSyncRef(cwd: string): Promise<string | null> {
  const ref = await git(['rev-parse', 'refs/cella/last-sync'], cwd, { ignoreErrors: true });
  return ref || null;
}

/**
 * Check if one commit is an ancestor of another.
 */
export async function isAncestor(cwd: string, ancestor: string, descendant: string): Promise<boolean> {
  try {
    await git(['merge-base', '--is-ancestor', ancestor, descendant], cwd);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get the effective merge-base, preferring the stored last-sync ref when it's more recent.
 * This handles stale merge-base caused by previous squash syncs (single-parent commits
 * don't update git's merge-base graph).
 *
 * @returns The effective base commit, whether git's base was stale, and the stored ref
 */
export async function getEffectiveMergeBase(
  cwd: string,
  headRef: string,
  upstreamRef: string,
): Promise<{ base: string; isStale: boolean; storedRef: string | null }> {
  const gitBase = await getMergeBase(cwd, headRef, upstreamRef);
  const storedRef = await getStoredSyncRef(cwd);

  if (!storedRef) {
    return { base: gitBase, isStale: false, storedRef: null };
  }

  // Check if stored ref is a descendant of git's merge-base (i.e., more recent)
  const storedIsNewer = await isAncestor(cwd, gitBase, storedRef);

  if (storedIsNewer && storedRef !== gitBase) {
    return { base: storedRef, isStale: true, storedRef };
  }

  return { base: gitBase, isStale: false, storedRef };
}

/**
 * Remove .git/MERGE_HEAD to convert a pending merge into a regular commit.
 * Used by squash strategy to create single-parent commits while preserving
 * correct 3-way merge behavior internally.
 */
export async function removeMergeHead(cwd: string): Promise<void> {
  const { unlink } = await import('node:fs/promises');
  const { join } = await import('node:path');
  try {
    await unlink(join(cwd, '.git', 'MERGE_HEAD'));
  } catch {
    // MERGE_HEAD doesn't exist - that's fine
  }
}

/**
 * Stage all changes and create a commit.
 */
export async function autoCommit(cwd: string, message: string): Promise<void> {
  await git(['add', '-A'], cwd);
  await git(['commit', '-m', message, '--allow-empty'], cwd, { skipEditor: true });
}
