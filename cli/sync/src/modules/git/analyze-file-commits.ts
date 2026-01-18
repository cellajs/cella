import type { RepoConfig } from '#/config';
import { CommitEntry, CommitSummary } from '#/types';
import { getFileCommitHistory } from '#/utils/git/files';

/**
 * NOTE: Commit history comparison MUST use sync-branch (syncBranchRef), NOT development (branchRef).
 *
 * sync-branch maintains full upstream commit history (actual merge commits from upstream).
 * development has squashed commits, so upstream SHAs won't exist there.
 *
 * Using development would cause getSharedAncestor() to return undefined, marking
 * all files as 'unrelated' and triggering repeated unnecessary syncs.
 */

// Structure to hold commit lookup data
type CommitLookup = {
  commits: CommitEntry[];
  shas: string[];
  shasSet: Set<string>;
};

/**
 * Compares the commit history of a specific file between
 * an upstream repo and a fork repo.
 *
 * Returns the ahead/behind counts, shared ancestor, coverage,
 * and sync status.
 *
 * @param upstream - Upstream repository config (local).
 * @param fork - Fork repository config (local).
 * @param filePath - Relative file path to compare.
 *
 * @throws If either repo is not local.
 * @returns A Promise resolving to a CommitSummary object containing the analysis results.
 */
export async function analyzeFileCommits(
  upstream: RepoConfig,
  fork: RepoConfig,
  filePath: string,
): Promise<CommitSummary> {
  // Use syncBranchRef for fork - it contains actual upstream commits (not squashed)
  // This allows proper ancestor detection via shared commit SHAs
  const [upstreamCommits, forkCommits] = await Promise.all([
    getFileCommitHistory(upstream.workingDirectory, upstream.branchRef, filePath),
    getFileCommitHistory(fork.workingDirectory, fork.syncBranchRef, filePath),
  ]);

  const upstreamLookup = toCommitLookup(upstreamCommits);
  const forkLookup = toCommitLookup(forkCommits);

  const historyCoverage = getHistoryCoverage(upstreamLookup, forkLookup);
  const sharedAncestor = getSharedAncestor(upstreamLookup, forkLookup);
  const amount = getAmountAheadBehind(upstreamLookup, forkLookup, sharedAncestor?.sha);
  const status = getStatus(sharedAncestor?.sha, amount.ahead, amount.behind);

  return {
    status,
    commitsAhead: amount.ahead,
    commitsBehind: amount.behind,
    sharedAncestorSha: sharedAncestor?.sha,
    lastSyncedAt: sharedAncestor?.date,
    historyCoverage,
  };
}

/**
 * Converts a commit history array into a lookup structure for efficient querying
 *
 * @param commits - Array of commit entries
 *
 * @returns CommitLookup structure containing commits, SHAs array, and SHAs set
 */
function toCommitLookup(commits: CommitEntry[]): CommitLookup {
  const shas = commits.map((entry) => entry.sha);
  const shasSet = new Set(shas);
  return { shas, shasSet, commits };
}

/**
 * Finds the first shared commit (common ancestor) between upstream and fork histories.
 *
 * @param upstreamLookup - Commit lookup for the upstream repository
 * @param forkLookup - Commit lookup for the fork repository
 *
 * @returns The shared CommitEntry if found, otherwise undefined
 */
function getSharedAncestor(upstreamLookup: CommitLookup, forkLookup: CommitLookup): CommitEntry | undefined {
  return forkLookup.commits.find((entry) => upstreamLookup.shasSet.has(entry.sha));
}

/**
 * Calculates how many commits ahead & behind the fork is compared to the upstream
 *
 * @param upstreamLookup - Commit lookup for the upstream repository
 * @param forkLookup - Commit lookup for the fork repository
 * @param ancestorSha - SHA of the shared ancestor commit
 *
 * @returns An object containing the counts of commits ahead and behind
 */
function getAmountAheadBehind(
  upstreamLookup: CommitLookup,
  forkLookup: CommitLookup,
  ancestorSha?: string,
): { ahead: number; behind: number } {
  if (!ancestorSha) return { ahead: 0, behind: 0 };

  const forkIndex = forkLookup.shas.findIndex((sha) => sha === ancestorSha);
  const upstreamIndex = upstreamLookup.shas.findIndex((sha) => sha === ancestorSha);

  // Commits that appear *before* the ancestor are the "ahead/behind" counts
  const ahead = forkIndex === -1 ? forkLookup.shas.length : forkIndex;
  const behind = upstreamIndex === -1 ? upstreamLookup.shas.length : upstreamIndex;

  return { ahead, behind };
}

/**
 * Determines the status of the current commit
 *
 * @param ancestorSha - SHA of the shared ancestor commit
 * @param commitsAhead - Number of commits the fork is ahead
 * @param commitsBehind - Number of commits the fork is behind
 *
 * @returns The commit status as a string
 */
function getStatus(
  ancestorSha: string | undefined,
  commitsAhead: number,
  commitsBehind: number,
): CommitSummary['status'] {
  if (!ancestorSha) return 'unrelated';
  if (commitsAhead > 0 && commitsBehind === 0) return 'ahead';
  if (commitsBehind > 0 && commitsAhead === 0) return 'behind';
  if (commitsAhead > 0 && commitsBehind > 0) return 'diverged';
  return 'upToDate';
}

/**
 * Determines the coverage of upstream commit history present in the fork.
 */
function getHistoryCoverage(upstreamLookup: CommitLookup, forkLookup: CommitLookup): CommitSummary['historyCoverage'] {
  const total = upstreamLookup.shas.length;
  const found = upstreamLookup.shas.filter((sha) => forkLookup.shasSet.has(sha)).length;

  if (found === 0) return 'unknown';
  if (found === total) return 'complete';
  return 'partial';
}
