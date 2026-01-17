import { CommitEntry, FileEntry } from '../../types';
import {
  gitAdd,
  gitCheckoutOursFilePath,
  gitDiffCached,
  gitDiffUnmerged,
  gitLastCommitShaForFile,
  gitLogFileHistory,
  gitLsTreeRecursive,
} from './command';

/** Yield to event loop to allow spinner animation */
const yieldToEventLoop = () => new Promise((resolve) => setImmediate(resolve));

/** Process items in batches, yielding between batches for UI updates */
async function processBatched<T, R>(items: T[], batchSize: number, processor: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map(processor));
    results.push(...batchResults);
    await yieldToEventLoop();
  }
  return results;
}

/**
 * Retrieves all tracked files in a repository (for the specified branch)
 * along with their blob and last commit SHAs.
 *
 * Internally runs:
 * - `git ls-tree -r <branch>` to list tracked files and blob SHAs
 * - `git log -n 1 --format=%H <branch> -- <file>` for each file
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
  const output = await gitLsTreeRecursive(repoPath, branchName);
  const lines = output.split('\n').filter((line) => line.trim());

  // Process in batches of 50 to avoid EBADF and allow spinner animation
  const entries = await processBatched(lines, 50, async (line) => {
    const [meta, filePath] = line.split('\t');
    const blobSha = meta.split(' ')[2];
    const shortBlobSha = blobSha.slice(0, 7);

    const commitShaOutput = await gitLastCommitShaForFile(repoPath, branchName, filePath);
    const shortCommitSha = commitShaOutput.slice(0, 7);

    return {
      path: filePath,
      blobSha,
      shortBlobSha,
      lastCommitSha: commitShaOutput,
      shortCommitSha,
    };
  });

  return entries;
}

/**
 * Retrieves the full commit history for a specific file on a given branch.
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
  const output = await gitLogFileHistory(repoPath, branchName, filePath);
  return output
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [sha, date] = line.split('|');
      return { sha, date };
    });
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
