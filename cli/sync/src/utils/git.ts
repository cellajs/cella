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
 * Get the repository root path.
 */
export async function getRepoRoot(cwd: string): Promise<string> {
  return git(['rev-parse', '--show-toplevel'], cwd);
}

/**
 * Check if a remote exists.
 */
export async function remoteExists(cwd: string, remoteName: string): Promise<boolean> {
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
    const output = await git(
      ['log', '--name-only', '--format=%h %ar', `${fromRef}..${toRef}`],
      cwd,
      { ignoreErrors: true },
    );

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
 * Get list of changed files from status.
 */
export async function getChangedFiles(cwd: string): Promise<string[]> {
  const status = await git(['status', '--porcelain'], cwd);
  if (!status) return [];
  return status.split('\n').map((line) => line.slice(3).split(' -> ')[0]);
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
export async function merge(
  cwd: string,
  ref: string,
  options: { noCommit?: boolean; noEdit?: boolean } = {},
): Promise<{ success: boolean; conflicts: string[] }> {
  const args = ['merge', ref];
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
 * Resolve a conflict by choosing ours (fork version).
 */
export async function resolveOurs(cwd: string, filePath: string): Promise<void> {
  await git(['checkout', '--ours', filePath], cwd);
  await git(['add', filePath], cwd);
}

/**
 * Resolve a conflict by choosing theirs (upstream version).
 */
export async function resolveTheirs(cwd: string, filePath: string): Promise<void> {
  await git(['checkout', '--theirs', filePath], cwd);
  await git(['add', filePath], cwd);
}

/**
 * Remove a file from the index and working tree.
 */
export async function removeFile(cwd: string, filePath: string): Promise<void> {
  await git(['rm', '-f', filePath], cwd, { ignoreErrors: true });
}

/**
 * Stage a file.
 */
export async function add(cwd: string, filePath: string): Promise<void> {
  await git(['add', filePath], cwd);
}

/**
 * Stage all changes.
 */
export async function addAll(cwd: string): Promise<void> {
  await git(['add', '-A'], cwd);
}

/**
 * Abort an in-progress merge.
 */
export async function mergeAbort(cwd: string): Promise<void> {
  await git(['merge', '--abort'], cwd, { ignoreErrors: true });
}

/**
 * Get list of all tracked files at a ref.
 */
export async function listFilesAtRef(cwd: string, ref: string): Promise<string[]> {
  const output = await git(['ls-tree', '-r', '--name-only', ref], cwd);
  if (!output) return [];
  return output.split('\n').filter(Boolean);
}

/**
 * Get list of all tracked files in the current HEAD.
 */
export async function listTrackedFiles(cwd: string): Promise<string[]> {
  return listFilesAtRef(cwd, 'HEAD');
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
 * Get the hash of a file at a ref.
 */
export async function getFileHashAtRef(cwd: string, ref: string, filePath: string): Promise<string | null> {
  const output = await git(['ls-tree', ref, '--', filePath], cwd, { ignoreErrors: true });
  if (!output) return null;
  // Format: <mode> <type> <hash>\t<path>
  const parts = output.split(/\s+/);
  return parts[2] || null;
}

/**
 * Compare file hashes between two refs.
 */
export async function compareFileAtRefs(
  cwd: string,
  ref1: string,
  ref2: string,
  filePath: string,
): Promise<'identical' | 'different' | 'only-in-first' | 'only-in-second'> {
  const hash1 = await getFileHashAtRef(cwd, ref1, filePath);
  const hash2 = await getFileHashAtRef(cwd, ref2, filePath);

  if (hash1 && hash2) {
    return hash1 === hash2 ? 'identical' : 'different';
  }
  if (hash1 && !hash2) return 'only-in-first';
  if (!hash1 && hash2) return 'only-in-second';
  return 'identical'; // Neither exists
}

/**
 * Get the merge base between two refs.
 */
export async function getMergeBase(cwd: string, ref1: string, ref2: string): Promise<string> {
  return git(['merge-base', ref1, ref2], cwd);
}

/**
 * Commit staged changes.
 */
export async function commit(cwd: string, message: string): Promise<void> {
  await git(['commit', '-m', message], cwd, { skipEditor: true });
}

/**
 * Get files changed between two refs using diff-tree.
 * Returns a map of filePath -> { status, hash1, hash2 }
 *
 * This is much faster than checking each file individually.
 * Status codes: A=added, D=deleted, M=modified, T=type-changed
 */
export async function getFileChanges(
  cwd: string,
  baseRef: string,
  targetRef: string,
): Promise<Map<string, { status: 'A' | 'D' | 'M' | 'T'; baseHash: string | null; targetHash: string | null }>> {
  // Use diff-tree to get all changed files between refs
  // Format: :oldmode newmode oldhash newhash status\tpath
  const output = await git(['diff-tree', '-r', '--no-commit-id', baseRef, targetRef], cwd, { ignoreErrors: true });

  const changes = new Map<
    string,
    { status: 'A' | 'D' | 'M' | 'T'; baseHash: string | null; targetHash: string | null }
  >();

  if (!output) return changes;

  for (const line of output.split('\n')) {
    if (!line) continue;
    // Parse: :100644 100644 abc123... def456... M\tpath/to/file
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
 * Restore a file to MERGE_HEAD version (their/upstream version during merge).
 * Updates both index and worktree to match MERGE_HEAD.
 */
export async function restoreToMergeHead(cwd: string, filePath: string): Promise<void> {
  await git(['restore', '--source=MERGE_HEAD', '--staged', '--worktree', '--', filePath], cwd);
}

/**
 * Remove a file from index with tracked delete (git rm).
 * Records a deletion in the merge result.
 */
export async function gitRm(cwd: string, filePath: string): Promise<void> {
  await git(['rm', '-f', '--', filePath], cwd, { ignoreErrors: true });
}

/**
 * Export staged changes as a binary patch file.
 * Returns the path to the temporary patch file.
 */
export async function exportStagedPatch(cwd: string): Promise<string | null> {
  const { writeFileSync, mkdtempSync } = await import('node:fs');
  const { join } = await import('node:path');
  const { tmpdir } = await import('node:os');

  // Create temp file for patch
  const tempDir = mkdtempSync(join(tmpdir(), 'cella-patch-'));
  const patchPath = join(tempDir, 'changes.patch');

  // Export patch directly to file to preserve binary content
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const execFileAsync = promisify(execFile);

  const { stdout } = await execFileAsync('git', ['diff', '--cached', '--binary'], {
    cwd,
    maxBuffer: 100 * 1024 * 1024, // 100MB
    encoding: 'buffer', // Get raw buffer to preserve binary data
  });

  if (!stdout || stdout.length === 0) {
    return null;
  }

  writeFileSync(patchPath, stdout);
  return patchPath;
}

/**
 * Apply a patch file to the index and worktree.
 */
export async function applyPatch(cwd: string, patchPath: string): Promise<void> {
  await git(['apply', '--index', patchPath], cwd);
}

/**
 * Check if a file exists in the worktree filesystem.
 */
export async function fileExistsInWorktree(cwd: string, filePath: string): Promise<boolean> {
  const { existsSync } = await import('node:fs');
  const { join } = await import('node:path');
  return existsSync(join(cwd, filePath));
}
