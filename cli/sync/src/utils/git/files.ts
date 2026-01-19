import { CommitEntry, FileEntry } from '#/types';
import { getCachedCommitHistory, getCachedFileHashes, setCachedCommitHistory, setCachedFileHashes } from '../cache';
import {
  gitAdd,
  gitCheckoutOursFilePath,
  gitDiffCached,
  gitDiffCachedDeleted,
  gitDiffUnmerged,
  gitLogAllFilesLastCommit,
  gitLogFileHistory,
  gitLsTreeRecursive,
} from './command';

/**
 * Retrieves all tracked files in a repository (for the specified branch)
 * along with their blob and last commit SHAs.
 *
 * Uses in-memory session cache to avoid redundant git calls within the same CLI run.
 * Optimized to use only 2 git commands total:
 * - `git ls-tree -r <branch>` to list tracked files and blob SHAs
 * - `git log --format=%H --name-only <branch>` to get all file→commit mappings at once
 *
 * @param repoPath - The file system path to the Git repository
 * @param branchName - The name of the branch to inspect (defaults to `'HEAD'`)
 *
 * @returns An array of {@link FileEntry} objects containing file paths and SHA info
 *
 * @example
 * const files = await getGitFileHashes('/repo', 'main');
 * console.info(files[0]);
 * // { path: 'src/index.ts', blobSha: 'abc123...', shortBlobSha: 'abc1234', lastCommitSha: 'def456...', shortCommitSha: 'def4567' }
 */
export async function getGitFileHashes(repoPath: string, branchName: string = 'HEAD'): Promise<FileEntry[]> {
  // Check session cache first
  const cached = getCachedFileHashes(repoPath, branchName);
  if (cached) return cached;

  // Fetch file tree and last commits in parallel (2 git commands total)
  const [treeOutput, fileToCommit] = await Promise.all([
    gitLsTreeRecursive(repoPath, branchName),
    gitLogAllFilesLastCommit(repoPath, branchName),
  ]);

  const lines = treeOutput.split('\n').filter((line) => line.trim());

  const entries = lines.map((line) => {
    const [meta, filePath] = line.split('\t');
    const blobSha = meta.split(' ')[2];
    const shortBlobSha = blobSha.slice(0, 7);

    const lastCommitSha = fileToCommit.get(filePath) || '';
    const shortCommitSha = lastCommitSha.slice(0, 7);

    return {
      path: filePath,
      blobSha,
      shortBlobSha,
      lastCommitSha,
      shortCommitSha,
    };
  });

  // Store in session cache
  setCachedFileHashes(repoPath, branchName, entries);

  return entries;
}

/**
 * Retrieves the full commit history for a specific file on a given branch.
 * Uses in-memory session cache to avoid redundant git calls within the same CLI run.
 * Internally runs:
 * - `git log --format="%H|%aI" --follow <branch> -- <file>`
 *
 * @param repoPath - The file system path to the Git repository
 * @param branchName - The branch name to inspect
 * @param filePath - The file path to retrieve commit history for
 *
 * @returns An array of {@link CommitEntry} objects containing commit SHAs and dates
 *
 * @example
 * const history = await getFileCommitHistory('/repo', 'main', 'src/app.ts');
 * console.info(history[0]); // { sha: 'abc123...', date: '2024-12-01T10:20:30Z' }
 */
export async function getFileCommitHistory(
  repoPath: string,
  branchName: string,
  filePath: string,
): Promise<CommitEntry[]> {
  // Check session cache first
  const cached = getCachedCommitHistory(repoPath, branchName, filePath);
  if (cached) return cached;

  const output = await gitLogFileHistory(repoPath, branchName, filePath);
  const commits = output
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [sha, date] = line.split('|');
      return { sha, date };
    });

  // Store in session cache
  setCachedCommitHistory(repoPath, branchName, filePath, commits);

  return commits;
}

/**
 * Lists all files currently in conflict (unmerged) in the given repository.
 * Internally runs `git diff --name-only --diff-filter=U`.
 *
 * @param repoPath - The file system path to the Git repository
 *
 * @returns An array of file paths that are currently unmerged
 *
 * @example
 * const unmerged = await getUnmergedFiles('/repo');
 * console.info(unmerged); // ['src/conflicted-file.ts']
 */
export async function getUnmergedFiles(repoPath: string): Promise<string[]> {
  const output = await gitDiffUnmerged(repoPath);
  return output ? output.split('\n').filter(Boolean) : [];
}

/**
 * Lists all files that are currently staged for commit.
 * Internally runs `git diff --name-only --cached`.
 *
 * @param repoPath - The file system path to the Git repository
 *
 * @returns An array of staged file paths
 *
 * @example
 * const staged = await getCachedFiles('/repo');
 * console.info(staged); // ['src/app.ts', 'package.json']
 */
export async function getCachedFiles(repoPath: string): Promise<string[]> {
  const output = await gitDiffCached(repoPath);
  return output ? output.split('\n').filter(Boolean) : [];
}

/**
 * Lists all files that are staged for deletion.
 * Internally runs `git diff --name-only --cached --diff-filter=D`.
 *
 * @param repoPath - The file system path to the Git repository
 *
 * @returns An array of file paths staged for deletion
 *
 * @example
 * const deleted = await getStagedDeletions('/repo');
 * console.info(deleted); // ['old-file.ts', 'removed-config.json']
 */
export async function getStagedDeletions(repoPath: string): Promise<string[]> {
  const output = await gitDiffCachedDeleted(repoPath);
  return output ? output.split('\n').filter(Boolean) : [];
}

/**
 * Resolves a merge conflict by choosing **our** version of the file
 * (i.e., the version from the current branch) and staging it.
 *
 * Internally runs:
 * - `git checkout --ours <file>`
 * - `git add <file>`
 *
 * @param repoPath - The file system path to the Git repository
 * @param filePath - The path to the conflicted file
 *
 * @returns A promise that resolves when the conflict has been resolved
 *
 * @example
 * await resolveConflictAsOurs('/repo', 'src/config.ts');
 */
export async function resolveConflictAsOurs(repoPath: string, filePath: string): Promise<void> {
  await gitCheckoutOursFilePath(repoPath, filePath);
  await gitAdd(repoPath, filePath);
}
