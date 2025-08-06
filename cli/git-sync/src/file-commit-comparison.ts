import { exec } from "child_process";
import { promisify } from "util";
import type { RepoConfig } from "./config";

const execAsync = promisify(exec);

/**
 * Represents a single Git commit.
 *
 * @property sha - The full SHA hash of the commit.
 * @property date - The ISO 8601 date string of the commit.
 */
export type CommitEntry = {
  sha: string;
  date: string;
};

/**
 * Describes the extent to which the commit history of the boilerplate
 * is present in the forked repository.
 *
 * This information is useful when analyzing sync state and estimating
 * the likelihood of merge conflicts or understanding how much of the
 * original history is preserved in the fork.
 *
 * - `Complete`: All commits from the boilerplate file history exist in the fork’s commit history.
 * - `Partial`: Some commits from the boilerplate history exist in the fork, but not all.
 * - `Unknown`: The coverage could not be determined, e.g., due to missing data or disconnected histories.
 */
export enum CommitHistoryCoverage {
  Complete = 'complete',
  Partial = 'partial',
  Unknown = 'unknown',
}

/**
 * Describes the synchronization status of a file’s commit history
 * between the boilerplate and a forked repository.
 *
 * - `Ahead`: The fork has additional commits not present in the boilerplate.
 * - `Behind`: The boilerplate has additional commits not present in the fork.
 * - `Diverged`: Both repositories have unique commits since their last shared commit.
 * - `Unrelated`: No common commit history could be found between the repositories.
 */
export enum CommitSyncStatus {
  Ahead = 'ahead',
  Behind = 'behind',
  Diverged = 'diverged',
  Unrelated = 'unrelated',
}

/**
 * A summary of commit differences for a specific file between
 * a boilerplate repository and a fork.
 *
 * @property status - The synchronization status of the file.
 * @property commitsAhead - Number of commits the fork is ahead of the boilerplate.
 * @property commitsBehind - Number of commits the fork is behind the boilerplate.
 * @property sharedAncestorSha - SHA of the last shared commit, if any.
 * @property lastSyncedAt - ISO date of the last shared commit, if available.
 */
export type CommitComparisonSummary = {
  status: CommitSyncStatus;
  commitsAhead: number;
  commitsBehind: number;
  sharedAncestorSha?: string;
  lastSyncedAt?: string;
  commitHistoryCoverage: CommitHistoryCoverage;
};

/**
 * Analyzes and compares the commit history of a specific file between
 * a boilerplate repository and a forked repository.
 *
 * This function determines how far the fork is ahead or behind
 * the boilerplate for a given file, based on Git history.
 *
 * @param boilerplateConfig - Configuration object for the boilerplate repository.
 * @param forkConfig - Configuration object for the fork repository.
 * @param filePath - The relative path to the file within the repositories.
 *
 * @returns A summary of commit differences and sync status for the specified file.
 *
 * @throws Will throw an error if either repository is not local.
 */
export async function getFileCommitComparison(
  boilerplateConfig: RepoConfig,
  forkConfig: RepoConfig,
  filePath: string,
): Promise<CommitComparisonSummary> {
  if (boilerplateConfig.use !== 'local' || forkConfig.use !== 'local') {
    throw new Error("Only local repositories are supported for history comparison.");
  }

  const [boilerHistory, forkHistory] = await Promise.all([
    getFileCommitHistory(boilerplateConfig.filePath, boilerplateConfig.branch, filePath),
    getFileCommitHistory(forkConfig.filePath, forkConfig.branch, filePath),
  ]);

  const boilerShas = boilerHistory.map(e => e.sha);
  const forkShas = forkHistory.map(e => e.sha);

  const boilerSet = new Set(boilerShas);
  const forkSet = new Set(forkShas);

  const commitHistoryCoverage = getCommitHistoryCoverage(boilerShas, forkSet);
  const sharedAncestor = findSharedAncestor(forkHistory, boilerSet);
  const sharedAncestorSha = sharedAncestor?.sha;
  const lastSyncedAt = sharedAncestor?.date;

  const { commitsAhead, commitsBehind } = calculateAheadBehind(forkShas, boilerShas, sharedAncestorSha);

  const status = determineSyncStatus(sharedAncestorSha, commitsAhead, commitsBehind);

  return {
    status,
    commitsAhead,
    commitsBehind,
    sharedAncestorSha,
    lastSyncedAt,
    commitHistoryCoverage,
  };
}

/**
 * Retrieves the commit history for a specific file in a Git repository.
 *
 * This function runs a Git log command to fetch the list of commits
 * (SHA and ISO date) that affected the given file, including history
 * through renames (via `--follow`).
 *
 * @param repoPath - The local path to the Git repository.
 * @param branch - The name of the branch to retrieve history from.
 * @param filePath - The relative path to the file within the repository.
 *
 * @returns A list of commits affecting the file, ordered from most recent to oldest.
 *
 * @example
 * const commits = await getFileHistory('/repos/my-app', 'main', 'src/index.ts');
 * console.log(commits[0].sha); // Latest commit SHA
 */
async function getFileCommitHistory(repoPath: string, branch: string, filePath: string): Promise<CommitEntry[]> {
  const cmd = `git -C "${repoPath}" log --format="%H|%aI" --follow ${branch} -- "${filePath}"`;
  const { stdout } = await execAsync(cmd);
  return stdout
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [sha, date] = line.split('|');
      return { sha, date };
    });
}

/**
 * Finds the first shared commit (common ancestor) between the fork and boilerplate histories.
 * 
 * Iterates through the fork's commit history and returns the first commit that also exists in the boilerplate history.
 * Assumes that the fork history is ordered from most recent to oldest.
 *
 * @param forkHistory - The commit history of the forked repository, ordered from newest to oldest.
 * @param boilerShas - A set of commit SHAs from the boilerplate repository for quick lookup.
 * @returns The first matching commit entry found in both histories, or `undefined` if none is found.
 */
function findSharedAncestor(
  forkHistory: CommitEntry[],
  boilerShas: Set<string>
): CommitEntry | undefined {
  return forkHistory.find(entry => boilerShas.has(entry.sha));
}

/**
 * Calculates the number of commits a fork is ahead or behind compared to the boilerplate.
 * 
 * Uses the index of the shared ancestor SHA in both histories to determine the ahead/behind counts.
 *
 * @param forkShas - An array of commit SHAs from the forked repository, ordered from newest to oldest.
 * @param boilerShas - An array of commit SHAs from the boilerplate repository, ordered from newest to oldest.
 * @param ancestorSha - The SHA of the most recent shared commit, if available.
 * @returns An object containing `commitsAhead` and `commitsBehind` counts.
 */
function calculateAheadBehind(
  forkShas: string[],
  boilerShas: string[],
  ancestorSha?: string
): { commitsAhead: number; commitsBehind: number } {
  const commitsAhead = ancestorSha ? forkShas.findIndex(sha => sha === ancestorSha) : -1;
  const commitsBehind = ancestorSha ? boilerShas.findIndex(sha => sha === ancestorSha) : -1;
  return {
    commitsAhead: commitsAhead === -1 ? 0 : commitsAhead,
    commitsBehind: commitsBehind === -1 ? 0 : commitsBehind,
  };
}

/**
 * Determines the synchronization status between a fork and the boilerplate based on their shared ancestor and commit differences.
 *
 * - If no shared ancestor is found, the repositories are `Unrelated`.
 * - If the fork has commits ahead but none behind, it's `Ahead`.
 * - If the boilerplate has commits ahead but none in the fork, it's `Behind`.
 * - If both have commits since the ancestor, it's `Diverged`.
 * - If no commits have been made since the ancestor, the result defaults to `Unrelated`.
 *
 * @param ancestorSha - The SHA of the shared ancestor commit, if any.
 * @param commitsAhead - Number of commits the fork is ahead of the shared ancestor.
 * @param commitsBehind - Number of commits the boilerplate is ahead of the shared ancestor.
 * @returns A `CommitSyncStatus` representing the sync state of the fork relative to the boilerplate.
 */
function determineSyncStatus(
  ancestorSha: string | undefined,
  commitsAhead: number,
  commitsBehind: number
): CommitSyncStatus {
  if (!ancestorSha) return CommitSyncStatus.Unrelated;
  if (commitsAhead > 0 && commitsBehind === 0) return CommitSyncStatus.Ahead;
  if (commitsBehind > 0 && commitsAhead === 0) return CommitSyncStatus.Behind;
  if (commitsAhead > 0 && commitsBehind > 0) return CommitSyncStatus.Diverged;
  return CommitSyncStatus.Unrelated;
}

/**
 * Determines the extent to which the boilerplate commit history
 * is present in the fork's commit history.
 *
 * - `Complete`: All boilerplate commits are found in the fork.
 * - `Partial`: Some boilerplate commits are found in the fork.
 * - `None`: No boilerplate commits are found in the fork.
 *
 * @param boilerShas - Array of commit SHAs from the boilerplate history.
 * @param forkSet - Set of commit SHAs from the fork's history for fast lookup.
 * @returns A `CommitHistoryCoverage` value describing the inclusion level.
 */
export function getCommitHistoryCoverage(
  boilerShas: string[],
  forkSet: Set<string>
): CommitHistoryCoverage {
  const total = boilerShas.length;
  const found = boilerShas.filter(sha => forkSet.has(sha)).length;

  if (found === 0) return CommitHistoryCoverage.Unknown;
  if (found === total) return CommitHistoryCoverage.Complete;
  return CommitHistoryCoverage.Partial;
}