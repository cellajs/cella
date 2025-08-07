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

export type CommitHistorySummary = {
  status: 'upToDate' | 'ahead' | 'behind' | 'diverged' | 'unrelated';
  commitsAhead: number;
  commitsBehind: number;
  sharedAncestorSha?: string;
  lastSyncedAt?: string;
  commitHistoryCoverage: 'complete' | 'partial' | 'unknown';
};

export type FileAnalysis = {
  filePath: string;
  boilerplateFile: FileEntry;
  forkFile?: FileEntry;
  commitHistorySummary?: CommitHistorySummary;
  blobStatus?: 'identical' | 'different' | 'unknown';
  conflictLikelihood?: 'low' | 'medium' | 'high';
  conflictReason?: 'none' | 'divergedHistories' | 'blobMismatch' | 'missingInFork' | 'unrelatedHistories' | 'outdatedInFork';
};