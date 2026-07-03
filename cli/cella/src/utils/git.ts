/**
 * Git command helpers for sync CLI v2.
 *
 * Provides typed wrappers around common git operations.
 */

import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readdir, rmdir, unlink } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import process from 'node:process';
import { promisify } from 'node:util';
import { readManifestBase } from './manifest';

const execFileAsync = promisify(execFile);

/**
 * Sanitize text by redacting credentials from URLs.
 * Prevents accidental credential exposure in error messages (CWE-532).
 */
function sanitizeCredentials(text: string): string {
  return text.replace(/https?:\/\/[^@\s]+@/g, (match) => {
    const protocol = match.startsWith('https') ? 'https' : 'http';
    return `${protocol}://***@`;
  });
}

/** Options for git command execution */
interface GitCommandOptions {
  /** Skip editor prompts (for merge commits, etc.) */
  skipEditor?: boolean;
  /** Maximum buffer size for stdout (default: 50MB) */
  maxBuffer?: number;
  /** Ignore command errors (return empty string instead of throwing) */
  ignoreErrors?: boolean;
  /** Additional environment variables for the git command */
  env?: Record<string, string>;
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
    ...options.env,
  };

  const maxBuffer = options.maxBuffer ?? 50 * 1024 * 1024; // 50MB default

  try {
    const { stdout } = await execFileAsync('git', args, { cwd, env, maxBuffer });
    return stdout.trim();
  } catch (error) {
    if (options.ignoreErrors) return '';
    // Sanitize to prevent credential leakage from git remote URLs
    if (error instanceof Error) {
      error.message = sanitizeCredentials(error.message);
    }
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
 * Switch to an existing branch.
 */
export async function switchBranch(cwd: string, branch: string): Promise<void> {
  await git(['switch', branch], cwd);
}

/**
 * Create and check out a new branch from a specific start point (branch/ref).
 */
export async function createBranchFrom(cwd: string, branch: string, startPoint: string): Promise<void> {
  await git(['switch', '-c', branch, startPoint], cwd);
}

/**
 * Delete a local branch (force). No-op if it doesn't exist.
 */
export async function deleteBranch(cwd: string, branch: string): Promise<void> {
  await git(['branch', '-D', branch], cwd, { ignoreErrors: true });
}

/**
 * Fast-forward the current branch from its upstream tracking branch.
 * Best-effort: ignores errors (e.g. no origin, offline, or nothing to pull).
 */
export async function pullFastForward(cwd: string): Promise<void> {
  await git(['pull', '--ff-only'], cwd, { ignoreErrors: true, skipEditor: true });
}

/** How the current branch compares to its upstream tracking branch. */
export interface UpstreamStatus {
  /** Upstream tracking ref (e.g. `origin/main`), or null when none is configured. */
  upstream: string | null;
  /** Commits the local branch has that its upstream doesn't. */
  ahead: number;
  /** Commits the upstream has that the local branch doesn't. */
  behind: number;
}

/**
 * Fetch the current branch's upstream, then report how far ahead/behind local is.
 *
 * The fetch is best-effort so an offline/no-remote run still returns whatever is already local.
 * Returns `upstream: null` when the branch has no tracking branch configured (local-only repo).
 */
export async function getUpstreamStatus(cwd: string): Promise<UpstreamStatus> {
  const upstream = await git(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}'], cwd, {
    ignoreErrors: true,
  });
  if (!upstream) return { upstream: null, ahead: 0, behind: 0 };

  // Refresh the remote-tracking ref so the comparison reflects the remote's latest state.
  const remote = upstream.split('/')[0];
  await git(['fetch', remote], cwd, { ignoreErrors: true, skipEditor: true });

  const counts = await git(['rev-list', '--left-right', '--count', `HEAD...${upstream}`], cwd, { ignoreErrors: true });
  const [ahead, behind] = counts.split(/\s+/).map((n) => Number.parseInt(n, 10) || 0);
  return { upstream, ahead: ahead ?? 0, behind: behind ?? 0 };
}

/**
 * Push a branch to a remote, setting upstream tracking.
 */
export async function pushBranch(cwd: string, remote: string, branch: string): Promise<void> {
  await git(['push', '-u', remote, branch], cwd);
}

/**
 * Commit the staged changes as a single-parent commit, discarding any in-progress merge state.
 *
 * A normal commit with `MERGE_HEAD` present records a two-parent merge commit. Because the fork
 * doesn't share pushed ancestry with upstream (the local `git replace` graft that makes merges
 * incremental is never pushed), such a merge commit makes the PR list the upstream branch's
 * entire history. Removing the merge state first collapses the staged delta into one clean
 * commit, so the PR shows a single commit with the incremental diff.
 */
export async function commitSquash(cwd: string, message: string): Promise<void> {
  for (const file of ['MERGE_HEAD', 'MERGE_MSG', 'MERGE_MODE']) {
    const path = join(cwd, '.git', file);
    if (existsSync(path)) await unlink(path);
  }
  await git(['commit', '-m', message], cwd, { skipEditor: true });
}

/**
 * Stage every change in the working tree (`git add -A`), including untracked and deleted files.
 */
export async function stageAll(cwd: string): Promise<void> {
  await git(['add', '-A'], cwd);
}

/**
 * Whether a merge is currently in progress (MERGE_HEAD present).
 */
export function mergeInProgress(cwd: string): boolean {
  return existsSync(join(cwd, '.git', 'MERGE_HEAD'));
}

/**
 * Get the abbreviated (short) SHA for a ref.
 */
export async function getShortSha(cwd: string, ref: string): Promise<string> {
  return git(['rev-parse', '--short', ref], cwd);
}

/**
 * Count uncommitted working tree entries using porcelain status.
 */
export async function getWorkingTreeChangeCount(cwd: string): Promise<number> {
  const status = await git(['status', '--porcelain'], cwd);
  if (!status) return 0;
  return status.split('\n').filter(Boolean).length;
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
 * Fetch upstream tags into a remote-scoped namespace (`refs/<remoteName>/tags/*`)
 * instead of the local `refs/tags/*`. This keeps cella's release tags from
 * colliding with the fork's own release tags (forks run their own release-please).
 * `--no-tags` prevents git from also writing them into `refs/tags/*`.
 */
export async function fetchUpstreamTags(cwd: string, remoteName: string): Promise<void> {
  await git(['fetch', remoteName, '--no-tags', `+refs/tags/*:refs/${remoteName}/tags/*`], cwd);
}

/**
 * Resolve the latest upstream release tag (semver-sorted `v*` tag) from the
 * remote-scoped tag namespace. Excludes non-template tags (e.g. `create-cella-v*`).
 * Returns the short tag name and its full ref, or null when no release exists.
 */
export async function resolveLatestReleaseTag(
  cwd: string,
  remoteName: string,
): Promise<{ tag: string; ref: string } | null> {
  const prefix = `refs/${remoteName}/tags/`;
  const output = await git(['for-each-ref', '--sort=-version:refname', '--format=%(refname)', prefix], cwd, {
    ignoreErrors: true,
  });
  if (!output) return null;
  for (const line of output.split('\n')) {
    const ref = line.trim();
    if (!ref) continue;
    const tag = ref.slice(prefix.length);
    // Template release tags look like 'v0.5.0'; skip component tags like 'create-cella-v*'.
    if (/^v\d/.test(tag)) return { tag, ref };
  }
  return null;
}

/**
 * Get the latest commit info from a ref.
 */
export async function getCommitInfo(
  cwd: string,
  ref: string,
): Promise<{ hash: string; message: string; date: string }> {
  const format = '%H%n%s%n%ar'; // hash, subject, relative date
  const output = await git(['log', '-1', `--format=${format}`, ref], cwd);
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

/** Commit metadata for a single log entry */
export interface CommitRangeEntry {
  hash: string;
  message: string;
  date: string;
}

/**
 * List commits in a ref range.
 *
 * By default this returns commits oldest-first to match GitHub compare ordering.
 * Supports skip+limit pagination so callers can show only the most recent N commits
 * without fetching the entire range.
 */
export async function listCommitsBetween(
  cwd: string,
  fromRef: string,
  toRef: string,
  options: {
    oldestFirst?: boolean;
    skip?: number;
    limit?: number;
  } = {},
): Promise<CommitRangeEntry[]> {
  const { oldestFirst = true, skip = 0, limit } = options;
  const args = ['log', '--format=%H%x1f%s%x1f%ar'];

  if (oldestFirst) args.push('--reverse');
  args.push(`${fromRef}..${toRef}`);

  const output = await git(args, cwd, { ignoreErrors: true });
  if (!output) return [];

  const commits: CommitRangeEntry[] = [];
  for (const line of output.split('\n')) {
    if (!line) continue;
    const [hash, message, date] = line.split('\x1f');
    if (!hash || !message || !date) continue;
    commits.push({ hash, message, date });
  }

  const normalizedSkip = Math.max(0, skip);
  const normalizedLimit = typeof limit === 'number' && limit > 0 ? limit : undefined;

  if (normalizedSkip === 0 && normalizedLimit === undefined) {
    return commits;
  }

  const start = Math.min(normalizedSkip, commits.length);
  const end = normalizedLimit === undefined ? commits.length : Math.min(start + normalizedLimit, commits.length);
  return commits.slice(start, end);
}

/**
 * File change info with date and commit hash.
 */
interface FileChangeInfo {
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
 * Throw if the working tree has uncommitted changes.
 * `subject` labels the repo in the error (e.g. 'working directory', 'fork').
 */
export async function assertClean(cwd: string, subject = 'working directory'): Promise<void> {
  if (!(await isClean(cwd))) {
    throw new Error(`${subject} has uncommitted changes. please commit or stash before syncing.`);
  }
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
 * Always uses --no-ff to prevent fast-forward, ensuring HEAD stays in place
 * and MERGE_HEAD is created for proper merge state tracking.
 */
export async function merge(
  cwd: string,
  ref: string,
  options: { noCommit?: boolean; noEdit?: boolean } = {},
): Promise<{ success: boolean; conflicts: string[] }> {
  const args = ['merge', '--no-ff', ref];
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
 * Restore a path from a ref into the working tree only, leaving the index untouched.
 * Useful when we want adopted changes to remain unstaged for review.
 */
export async function restoreWorktreeFromRef(cwd: string, ref: string, filePath: string): Promise<void> {
  await git(['restore', `--source=${ref}`, '--worktree', '--', filePath], cwd);
}

/**
 * Get the merge base between two refs.
 */
export async function getMergeBase(cwd: string, ref1: string, ref2: string): Promise<string> {
  return git(['merge-base', ref1, ref2], cwd);
}

/** File change status codes from git diff-tree */
type FileChangeStatus = 'A' | 'D' | 'M' | 'T' | 'R';

/** File change info from git diff-tree */
interface FileChange {
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
 *
 * Uses `git checkout HEAD --` instead of `git restore --source=HEAD` because
 * `git restore` fails on unmerged (conflicted) paths during a merge, while
 * `git checkout HEAD --` resolves them by taking HEAD's version.
 */
export async function restoreToHead(cwd: string, filePath: string): Promise<void> {
  await git(['checkout', 'HEAD', '--', filePath], cwd);
}

/**
 * Batch restore multiple files to HEAD version in a single git command.
 * Much faster than calling restoreToHead for each file individually.
 * Reduces IDE file watcher events by completing all restores at once.
 *
 * Uses `git checkout HEAD --` instead of `git restore --source=HEAD` because
 * `git restore` fails on unmerged (conflicted) paths during a merge, while
 * `git checkout HEAD --` resolves them by taking HEAD's version.
 */
export async function batchRestoreToHead(cwd: string, filePaths: string[]): Promise<void> {
  if (filePaths.length === 0) return;
  await git(['checkout', 'HEAD', '--', ...filePaths], cwd);
}

/**
 * Remove a file from index with tracked delete (git rm).
 * Records a deletion in the merge result.
 */
export async function gitRm(cwd: string, filePath: string): Promise<void> {
  await git(['rm', '-f', '--', filePath], cwd, { ignoreErrors: true });
}

/**
 * Batch remove multiple files from index with tracked delete.
 * Much faster than calling gitRm for each file individually.
 */
export async function batchGitRm(cwd: string, filePaths: string[]): Promise<void> {
  if (filePaths.length === 0) return;
  await git(['rm', '-f', '--', ...filePaths], cwd, { ignoreErrors: true });
}

/**
 * Get files staged as new additions in the index (diff-filter=A vs HEAD).
 * These are files that don't exist at HEAD but were brought in by a merge.
 */
export async function getStagedNewFiles(cwd: string): Promise<string[]> {
  const output = await git(['diff', '--cached', '--name-only', '--diff-filter=A'], cwd, { ignoreErrors: true });
  return output ? output.split('\n').filter(Boolean) : [];
}

/**
 * Remove files from the index only (--cached), leaving the working tree untouched.
 * Useful for cleaning up files staged by a merge that shouldn't be committed.
 */
export async function batchUnstageFiles(cwd: string, filePaths: string[]): Promise<void> {
  if (filePaths.length === 0) return;
  await git(['rm', '--cached', '-f', '--', ...filePaths], cwd, { ignoreErrors: true });
}

/**
 * Move/rename a file using git mv.
 * Creates parent directories if needed and preserves git history.
 */
export async function gitMv(cwd: string, oldPath: string, newPath: string): Promise<void> {
  // Ensure parent directory exists for new path
  const newDir = dirname(join(cwd, newPath));
  await mkdir(newDir, { recursive: true });

  await git(['mv', '-f', oldPath, newPath], cwd);
}

/**
 * Check if a file exists in the worktree filesystem.
 */
export async function fileExistsInWorktree(cwd: string, filePath: string): Promise<boolean> {
  return existsSync(join(cwd, filePath));
}

/**
 * Remove a file from the worktree filesystem if it exists.
 * Used to clean up files that git rm may not have removed (e.g., after squash merge).
 */
export async function removeFileFromWorktree(cwd: string, filePath: string): Promise<void> {
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
 * Fully remove a file: tracked delete from the index (git rm) plus filesystem removal
 * for cases git rm leaves behind (e.g. during a merge), including empty parent dirs.
 */
export async function removeFileFully(cwd: string, filePath: string): Promise<void> {
  await gitRm(cwd, filePath);
  await removeFileFromWorktree(cwd, filePath);
}

/**
 * Recursively remove empty parent directories up to (but not including) the root.
 * Stops when encountering a non-empty directory or the root.
 */
async function cleanupEmptyParentDirs(cwd: string, relativePath: string): Promise<void> {
  if (!relativePath || relativePath === '.') return;

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
 *
 * Also records the fork HEAD at store time as `refs/cella/last-sync-head`. The last-sync
 * ref is written while the merge is still staged (before the user commits), so it cannot be
 * trusted on its own: if the user runs `git merge --abort`, HEAD never advances and the ref
 * is left pointing at an upstream commit that was never actually integrated. Recording HEAD
 * lets `getEffectiveMergeBase` detect that an aborted/uncommitted merge produced a stale ref.
 */
export async function storeLastSyncRef(cwd: string, upstreamHash: string): Promise<void> {
  await git(['update-ref', 'refs/cella/last-sync', upstreamHash], cwd);
  const head = await git(['rev-parse', 'HEAD'], cwd, { ignoreErrors: true });
  if (head) {
    await git(['update-ref', 'refs/cella/last-sync-head', head], cwd);
  }
}

/** Stage a single path (git add). Best-effort — never throws. */
export async function stagePath(cwd: string, path: string): Promise<void> {
  await git(['add', '--', path], cwd, { ignoreErrors: true });
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
 * Get the fork HEAD that was recorded when the last-sync ref was stored.
 * Returns null if no HEAD was recorded.
 */
export async function getStoredSyncHead(cwd: string): Promise<string | null> {
  const ref = await git(['rev-parse', 'refs/cella/last-sync-head'], cwd, { ignoreErrors: true });
  return ref || null;
}

/**
 * Check whether a commit object is present in the local object store.
 */
async function commitObjectExists(cwd: string, sha: string): Promise<boolean> {
  try {
    await git(['cat-file', '-e', `${sha}^{commit}`], cwd);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get the root (parentless) commit of a ref's history. A create-cella scaffold has a
 * single rootless "Initial commit". Returns null when no root is found.
 */
async function getRootCommit(cwd: string, ref: string): Promise<string | null> {
  const out = await git(['rev-list', '--max-parents=0', ref], cwd, { ignoreErrors: true });
  const roots = out.split('\n').filter(Boolean);
  return roots.length > 0 ? roots[roots.length - 1] : null;
}

/**
 * Ensure a native git merge-base exists between the fork and upstream.
 *
 * A create-cella scaffold — or a fork whose upstream squashed its history — has unrelated
 * histories, so `git merge-base` finds nothing and every sync fails at the very first step.
 * This bootstraps ancestry non-destructively:
 *   1. If a native merge-base already exists, do nothing (the common case).
 *   2. Otherwise resolve the logical base commit: the stored `refs/cella/last-sync` ref, else
 *      the `cella.manifest.json` provenance committed by the last sync (or create-cella scaffold).
 *   3. Graft the fork's root commit onto that base with `git replace --graft`, so every native
 *      git operation (merge-base and the 3-way merge itself) sees correct ancestry. The replace
 *      ref is local-only and never pushed, so the fork's own published history stays clean.
 *
 * Throws an actionable error when no base can be determined or the recorded base is missing.
 */
export async function ensureSyncBase(cwd: string, headRef: string, upstreamRef: string): Promise<void> {
  // Native ancestry already present — nothing to bootstrap.
  const nativeBase = await git(['merge-base', headRef, upstreamRef], cwd, { ignoreErrors: true });
  if (nativeBase) return;

  const baseSha = (await getStoredSyncRef(cwd)) ?? (await readManifestBase(cwd));
  if (!baseSha) {
    throw new Error(
      `no common ancestor between the fork and '${upstreamRef}', and no sync base recorded.\n\n` +
        'This fork has unrelated history with upstream — typical for a create-cella scaffold, or after\n' +
        'upstream squashed its history. Seed the base with the upstream commit the fork was created from,\n' +
        'then re-run sync:\n\n' +
        '  git update-ref refs/cella/last-sync <upstream-sha>\n',
    );
  }

  if (!(await commitObjectExists(cwd, baseSha))) {
    throw new Error(
      `recorded sync base ${baseSha.slice(0, 12)} is not present after fetching '${upstreamRef}'.\n` +
        'It may belong to a different upstream, or have been dropped by an upstream history rewrite.',
    );
  }

  const root = await getRootCommit(cwd, headRef);
  if (!root) throw new Error("could not determine the fork's root commit to bootstrap sync ancestry");

  // Graft the fork root onto the base (idempotent via -f) so native git sees the ancestry.
  await git(['replace', '-f', '--graft', root, baseSha], cwd);

  // Record the base as the last-sync ref so future runs and the squash strategy stay consistent.
  await git(['update-ref', 'refs/cella/last-sync', baseSha], cwd);
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

  // Guard against a stale last-sync ref left behind by an aborted merge. The ref is written
  // while the merge is still staged; if the user runs `git merge --abort` instead of committing,
  // HEAD never advances past the recorded HEAD. In that case the upstream commits were never
  // integrated, so the stored ref must be discarded to avoid reporting "0 new commits".
  const storedHead = await getStoredSyncHead(cwd);
  if (storedHead) {
    const currentHead = await git(['rev-parse', headRef], cwd, { ignoreErrors: true });
    if (currentHead && currentHead === storedHead) {
      return { base: gitBase, isStale: false, storedRef: null };
    }
  }

  // Check if stored ref is a descendant of git's merge-base (i.e., more recent)
  const storedIsNewer = await isAncestor(cwd, gitBase, storedRef);

  if (storedIsNewer && storedRef !== gitBase) {
    return { base: storedRef, isStale: true, storedRef };
  }

  return { base: gitBase, isStale: false, storedRef };
}
