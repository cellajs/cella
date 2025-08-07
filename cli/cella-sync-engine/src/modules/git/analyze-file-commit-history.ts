import type { RepoConfig } from "../../config";
import { CommitHistorySummary, CommitEntry } from "../../types";
import { getFileCommitHistory } from "../../utils/git/files";

type CommitHistoryLookup = {
  entries: CommitEntry[];
  shas: string[];
  shasSet: Set<string>;
};

/**
 * Compares the commit history of a specific file between
 * a boilerplate repo and a fork repo.
 *
 * Returns the ahead/behind counts, shared ancestor, coverage,
 * and sync status.
 *
 * @param boilerplate - Boilerplate repository config (local).
 * @param fork - Fork repository config (local).
 * @param filePath - Relative file path to compare.
 * @throws If either repo is not local.
 */
export async function analyzeFileCommitHistory(
  boilerplate: RepoConfig,
  fork: RepoConfig,
  filePath: string,
): Promise<CommitHistorySummary> {
  if (boilerplate.use !== "local" || fork.use !== "local") {
    throw new Error("Only local repositories are supported for history comparison.");
  }
  
  const [boilerCommitHistory, forkCommitHistory] = await Promise.all([
    getFileCommitHistory(boilerplate.repoPath, boilerplate.branch, filePath),
    getFileCommitHistory(fork.repoPath, fork.branch, filePath),
  ]);

  const boilerplateCommits = toCommitHistoryLookup(boilerCommitHistory);
  const forkCommits = toCommitHistoryLookup(forkCommitHistory); 

  const commitHistoryCoverage = getCommitHistoryCoverage(boilerplateCommits, forkCommits);
  const sharedAncestor = findSharedAncestor(boilerplateCommits, forkCommits);
  const sharedAncestorSha = sharedAncestor?.sha;
  const { commitsAhead, commitsBehind } = calculateAheadBehind(boilerplateCommits, forkCommits, sharedAncestorSha);

  const status = determineCurrentStatus(sharedAncestorSha, commitsAhead, commitsBehind);

  return {
    status,
    commitsAhead,
    commitsBehind,
    sharedAncestorSha,
    lastSyncedAt: sharedAncestor?.date,
    commitHistoryCoverage,
  };
}

/** 
 * Converts a commit history array into a lookup structure for efficient querying 
 * 
 * @param history - Array of commit entries.
 * @returns A lookup object containing commit SHAs and a Set for fast existence checks.
 */
function toCommitHistoryLookup(history: CommitEntry[]): CommitHistoryLookup {
  const shas = history.map(entry => entry.sha);
  const shasSet = new Set(shas);
  return { shas, shasSet, entries: history };
}

/**
 * Finds the first shared commit (common ancestor) between boilerplate and fork histories.
 *
 * @param boilerplateCommits - Commit lookup for boilerplate.
 * @param forkCommits - Commit lookup for fork.
 * @returns The first shared commit or undefined if none found.
 */
function findSharedAncestor(
  boilerplateCommits: CommitHistoryLookup,
  forkCommits: CommitHistoryLookup,
): CommitEntry | undefined {
  return forkCommits.entries.find(entry => boilerplateCommits.shasSet.has(entry.sha));
}

/**
 * Calculates how many commits the fork is ahead or behind the boilerplate,
 * relative to the shared ancestor commit.
 *
 * @param boilerplateCommits - Commit lookup for boilerplate.
 * @param forkCommits - Commit lookup for fork.
 * @param ancestorSha - SHA of the shared ancestor commit.
 * @returns Counts of commits ahead and behind.
 */
function calculateAheadBehind(
  boilerplateCommits: CommitHistoryLookup,
  forkCommits: CommitHistoryLookup,
  ancestorSha?: string
): { commitsAhead: number; commitsBehind: number } {
  const commitsAhead = ancestorSha ? forkCommits.shas.findIndex(sha => sha === ancestorSha) : -1;
  const commitsBehind = ancestorSha ? boilerplateCommits.shas.findIndex(sha => sha === ancestorSha) : -1;
  return {
    commitsAhead: commitsAhead === -1 ? 0 : commitsAhead,
    commitsBehind: commitsBehind === -1 ? 0 : commitsBehind,
  };
}

/**
 * Determines the current status of the fork relative to the boilerplate.
 *
 * @param ancestorSha - SHA of shared ancestor commit.
 * @param commitsAhead - Number of commits fork is ahead.
 * @param commitsBehind - Number of commits fork is behind.
 * @returns Sync status enum.
 */
function determineCurrentStatus(
  ancestorSha: string | undefined,
  commitsAhead: number,
  commitsBehind: number
): CommitHistorySummary["status"] {
  if (!ancestorSha) return 'unrelated';
  if (commitsAhead > 0 && commitsBehind === 0) return 'ahead';
  if (commitsBehind > 0 && commitsAhead === 0) return 'behind';
  if (commitsAhead > 0 && commitsBehind > 0) return 'diverged';
  return 'upToDate';
}

/**
 * Determines the coverage of boilerplate commit history present in the fork.
 *
 * @param boilerplateCommits - Commit lookup for boilerplate.
 * @param forkCommits - Commit lookup for fork.
 * @returns Commit history coverage enum.
 */
export function getCommitHistoryCoverage(
  boilerplateCommits: CommitHistoryLookup,
  forkCommits: CommitHistoryLookup
): CommitHistorySummary["commitHistoryCoverage"] {
  const total = boilerplateCommits.shas.length;
  const found = boilerplateCommits.shas.filter(sha => forkCommits.shasSet.has(sha)).length;

  if (found === 0) return 'unknown'
  if (found === total) return 'complete'
  return 'partial'
}