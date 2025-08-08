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
  blobStatus?: 'identical' | 'different' | 'missing';
  mergeRiskLikelihood?: 'low' | 'medium' | 'high';
  mergeRiskReason?: 'identical' | 'blobMismatch' | 'missingInFork' | 'divergedContent' | 'unrelatedHistories' | 'unknown';
  mergeRiskSafeByGit?: boolean;
  mergeRiskCheck?: 'none' | 'gitAutoMerge' | 'verifyAncestor' | 'addedOrRemoved' | 'threeWayMergeCheck';
}