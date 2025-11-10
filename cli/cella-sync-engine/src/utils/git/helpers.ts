import { gitRevListCount, gitStatusPorcelain } from './command';

/**
 * Get the number of commits that are in `sourceBranch` but not in `baseBranch`.
 *
 * This function parses the raw string output from `gitRevListCount` into a number.
 *
 * @param repoPath - Absolute or relative path to the Git repository
 * @param sourceBranch - The branch to compare (e.g., feature branch)
 * @param baseBranch - The branch to compare against (e.g., main or development)
 * @returns The number of commits (integer)
 * @throws If the Git command fails or output cannot be parsed as a number
 *
 * @example
 * const count = await getCommitCount('/repo', 'sync-branch', 'development');
 * console.log(count); // e.g., 5
 */
export async function getCommitCount(
  repoPath: string,
  sourceBranch: string,
  baseBranch: string
): Promise<number> {
  const countStr = await gitRevListCount(repoPath, sourceBranch, baseBranch);
  return parseInt(countStr, 10);
}

/**
 * Checks if the repository has no uncommitted changes.
 * @param repoPath - The Absolute or relative path to the Git repository
 * @returns True if the repository has no uncommitted changes, false otherwise
 */
export async function isRepoClean(repoPath: string): Promise<boolean> {
  const status = await gitStatusPorcelain(repoPath);
  return status.trim().length === 0;
}