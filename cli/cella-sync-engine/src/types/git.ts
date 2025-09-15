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

export type FileMergeStrategy = {
  strategy: 'keep-fork' | 'keep-boilerplate' | 'remove-from-fork' | 'remove-from-boilerplate' | 'manual' | 'unknown';
  reason: string;
};