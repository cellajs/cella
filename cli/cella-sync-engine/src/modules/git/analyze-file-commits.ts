import type { RepoConfig } from "../../config";
import { CommitSummary, CommitEntry } from "../../types";
import { getFileCommitHistory } from "../../utils/git/files";

type CommitLookup = {
  commits: CommitEntry[];
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
export async function analyzeFileCommits(
  boilerplate: RepoConfig,
  fork: RepoConfig,
  filePath: string,
): Promise<CommitSummary> {
  const [boilerplateCommits, forkCommits] = await Promise.all([
    getFileCommitHistory(boilerplate.repoPath, boilerplate.branch, filePath),
    getFileCommitHistory(fork.repoPath, fork.branch, filePath),
  ]);

  const boilerplateLookup = toCommitLookup(boilerplateCommits);
  const forkLookup = toCommitLookup(forkCommits);

  const historyCoverage = getHistoryCoverage(boilerplateLookup, forkLookup);
  const sharedAncestor = getSharedAncestor(boilerplateLookup, forkLookup);
  const amount = getAmountAheadBehind(boilerplateLookup, forkLookup, sharedAncestor?.sha);
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
 */
function toCommitLookup(commits: CommitEntry[]): CommitLookup {
  const shas = commits.map(entry => entry.sha);
  const shasSet = new Set(shas);
  return { shas, shasSet, commits };
}

/**
 * Finds the first shared commit (common ancestor) between boilerplate and fork histories.
 */
function getSharedAncestor(
  boilerplateLookup: CommitLookup,
  forkLookup: CommitLookup,
): CommitEntry | undefined {
  return forkLookup.commits.find(entry => boilerplateLookup.shasSet.has(entry.sha));
}

/**
 * Calculates how many commits ahead & behind the fork is compared to the boilerplate
 */
function getAmountAheadBehind(
  boilerplateLookup: CommitLookup,
  forkLookup: CommitLookup,
  ancestorSha?: string
): { ahead: number; behind: number } {
  const ahead = ancestorSha ? forkLookup.shas.findIndex(sha => sha === ancestorSha) : -1;
  const behind = ancestorSha ? boilerplateLookup.shas.findIndex(sha => sha === ancestorSha) : -1;
  return {
    ahead: ahead === -1 ? 0 : ahead,
    behind: behind === -1 ? 0 : behind,
  };
}

/**
 * Determines the status of the current commit
 */
function getStatus(
  ancestorSha: string | undefined,
  commitsAhead: number,
  commitsBehind: number
): CommitSummary["status"] {
  if (!ancestorSha) return 'unrelated';
  if (commitsAhead > 0 && commitsBehind === 0) return 'ahead';
  if (commitsBehind > 0 && commitsAhead === 0) return 'behind';
  if (commitsAhead > 0 && commitsBehind > 0) return 'diverged';
  return 'upToDate';
}

/**
 * Determines the coverage of boilerplate commit history present in the fork.
 */
export function getHistoryCoverage(
  boilerplateLookup: CommitLookup,
  forkLookup: CommitLookup
): CommitSummary["historyCoverage"] {
  const total = boilerplateLookup.shas.length;
  const found = boilerplateLookup.shas.filter(sha => forkLookup.shasSet.has(sha)).length;

  if (found === 0) return 'unknown'
  if (found === total) return 'complete'
  return 'partial'
}