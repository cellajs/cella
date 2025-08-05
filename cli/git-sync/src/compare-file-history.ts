import { exec } from "child_process";
import { promisify } from "util";
import type { RepoConfig } from "./config";
import type { FileEntry } from "./get-files-with-hashed";

const execAsync = promisify(exec);

export type CommitEntry = {
  sha: string;
  date: string; // ISO format
};


export type FileHistoryComparisonStatus = 'ahead' | 'behind' | 'diverged' | 'unrelated';

export type FileHistoryComparisonResult = {
  status: FileHistoryComparisonStatus;
  aheadCount: number;      // how many commits fork is ahead (if any)
  behindCount: number;     // how many commits fork is behind (if any)
  commonAncestorSha?: string; // the SHA where both histories last intersected
  lastInSyncDate?: string;    // ISO date of the common ancestor commit
};

export async function compareFileHistory(
  boilerplateConfig: RepoConfig,
  forkConfig: RepoConfig,
  boilerplateFile: FileEntry,
): Promise<FileHistoryComparisonResult> {
  if (boilerplateConfig.use !== 'local' || forkConfig.use !== 'local') {
    throw new Error("only local repositories are supported for history comparison");
  }

  const path = boilerplateFile.path;

  const boilerplateHistory = await getFileHistory(boilerplateConfig.filepath, boilerplateConfig.branch, path);
  const forkHistory = await getFileHistory(forkConfig.filepath, forkConfig.branch, path);

  const boilerShas = boilerplateHistory.map(entry => entry.sha);
  const forkShas = forkHistory.map(entry => entry.sha);

  const boilerSet = new Set(boilerShas);

  // Find common ancestor
  const commonAncestorSha = forkShas.find(sha => boilerSet.has(sha));
  const lastInSyncDate = commonAncestorSha
    ? forkHistory.find(entry => entry.sha === commonAncestorSha)?.date
    : undefined;

  // Calculate ahead and behind counts
  const aheadCount = forkShas.findIndex(sha => sha === commonAncestorSha);
  const behindCount = boilerShas.findIndex(sha => sha === commonAncestorSha);

  let status: FileHistoryComparisonStatus;

  if (commonAncestorSha) {
    if (aheadCount > 0 && behindCount === 0) {
      status = 'ahead';
    } else if (behindCount > 0 && aheadCount === 0) {
      status = 'behind';
    } else if (aheadCount > 0 && behindCount > 0) {
      status = 'diverged';
    } else {
      // same file, no changes since ancestor
      status = 'unrelated'; // optional: introduce 'identical' or 'inSync'
    }
  } else {
    status = 'unrelated';
  }

  return {
    status,
    aheadCount: aheadCount === -1 ? 0 : aheadCount,
    behindCount: behindCount === -1 ? 0 : behindCount,
    commonAncestorSha,
    lastInSyncDate,
  };
}

async function getFileHistory(repoPath: string, branch: string, filePath: string): Promise<CommitEntry[]> {
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