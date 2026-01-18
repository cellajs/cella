import { gitRevListCount, gitShowFileAtCommit, gitStatusPorcelain, runGitCommand } from './command';

/**
 * Get the current branch name.
 *
 * @param repoPath - Absolute or relative path to the Git repository
 *
 * @returns The current branch name
 */
export async function getCurrentBranch(repoPath: string): Promise<string> {
  return runGitCommand(['rev-parse', '--abbrev-ref', 'HEAD'], repoPath);
}

/**
 * Get the number of commits that are in `sourceBranch` but not in `baseBranch`.
 *
 * This function parses the raw string output from `gitRevListCount` into a number.
 *
 * @param repoPath - Absolute or relative path to the Git repository
 * @param sourceBranch - The branch to compare (e.g., feature branch)
 * @param baseBranch - The branch to compare against (e.g., main or development)
 *
 * @throws If the Git command fails or output cannot be parsed as a number
 * @returns The number of commits (integer)
 *
 * @example
 * const count = await getCommitCount('/repo', 'sync-branch', 'development');
 * console.info(count); // e.g., 5
 */
export async function getCommitCount(repoPath: string, sourceBranch: string, baseBranch: string): Promise<number> {
  const countStr = await gitRevListCount(repoPath, sourceBranch, baseBranch);
  return parseInt(countStr, 10);
}

/**
 * Checks if the repository has no uncommitted changes.
 *
 * @param repoPath - The Absolute or relative path to the Git repository
 * @param ignorePaths - Optional paths to ignore when checking for changes
 *
 * @returns True if the repository has no uncommitted changes (outside ignored paths), false otherwise
 */
export async function isRepoClean(repoPath: string, ignorePaths?: string[]): Promise<boolean> {
  const status = await gitStatusPorcelain(repoPath);
  const lines = status.split('\n').filter((line) => line.trim().length > 0);
  if (lines.length === 0) return true;
  if (!ignorePaths?.length) return false;

  // Filter out ignored paths from status output
  const relevantChanges = lines.filter((line) => {
    // Porcelain format: XY filename (or XY orig -> new for renames)
    const filePath = line.slice(3).split(' -> ')[0];
    return !ignorePaths.some((ignored) => filePath.startsWith(ignored));
  });

  return relevantChanges.length === 0;
}

/**
 * Checks if there is anything to commit in the repository.
 *
 * @param repoPath - Absolute or relative path to the Git repository
 *
 * @returns True if there are staged changes or uncommitted changes to commit, false otherwise
 */
export async function hasAnythingToCommit(repoPath: string): Promise<boolean> {
  const status = await gitStatusPorcelain(repoPath);
  // `git status --porcelain` output:
  //   empty string -> nothing to commit
  //   non-empty -> something staged/unstaged
  return status.trim().length > 0;
}

/**
 * Fetches and parses a JSON file from a specific branch reference in the repository.
 *
 * @param repoPath - Path to the repository
 * @param branchRef - Branch reference (e.g., branch name, commit hash)
 * @param jsonPath - Path to the JSON file within the repository
 *
 * @returns The parsed JSON object or null if fetching/parsing fails
 */
export async function getRemoteJsonFile(repoPath: string, branchRef: string, jsonPath: string): Promise<any> {
  try {
    // Get the package.json contents
    const pkgStr = await gitShowFileAtCommit(repoPath, branchRef, jsonPath);
    return JSON.parse(pkgStr);
  } catch (err) {
    console.error(`Failed to fetch ${jsonPath} from ${branchRef}`, err);
    return null;
  }
}

/**
 * Lists the commit messages between two branches.
 *
 * @param repoPath - Path to the repository
 * @param fromBranch - Source branch
 * @param toBranch - Target branch
 * @param limit - Maximum number of commit messages to retrieve (default: 5)
 *
 * @returns An array of commit message strings
 */
export async function getLastCommitMessages(
  repoPath: string,
  fromBranch: string,
  toBranch: string,
  limit: number = 5,
): Promise<string[]> {
  // git log <toBranch>..<fromBranch> -n <limit> --pretty=format:%s
  const args = ['log', `${toBranch}..${fromBranch}`, '-n', String(limit), '--pretty=format:%s'];

  const output = await runGitCommand(args, repoPath);

  if (!output) return [];
  return output.split('\n').map((line) => line.trim());
}
