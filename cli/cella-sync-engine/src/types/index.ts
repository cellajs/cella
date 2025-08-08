export type FileEntry = {
  path: string;
  blobSha: string;
  shortBlobSha: string;
  lastCommitSha: string;
  shortCommitSha: string;
};

export type CommitEntry = {
  sha: string;
  date: string;
};

export type CommitSummary = {
  status: 'upToDate' | 'ahead' | 'behind' | 'diverged' | 'unrelated';
  commitsAhead: number;
  commitsBehind: number;
  sharedAncestorSha?: string;
  lastSyncedAt?: string;
  historyCoverage: 'complete' | 'partial' | 'unknown';
};

export type MergeRisk = {
  likelihood: 'low' | 'medium' | 'high';
  reason: 'identical' | 'blobMismatch' | 'missingInFork' | 'divergedContent' | 'unrelatedHistories' | 'unknown';
  safeByGit: boolean;
  check: 'none' | 'gitAutoMerge' | 'verifyAncestor' | 'addedOrRemoved' | 'threeWayMergeCheck';
};

export type FileAnalysis = {
  filePath: string;
  boilerplateFile: FileEntry;
  forkFile?: FileEntry;
  CommitSummary?: CommitSummary;
  blobStatus?: 'identical' | 'different' | 'missing';
  mergeRisk?: MergeRisk
}