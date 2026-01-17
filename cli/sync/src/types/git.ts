/**
 * Represents a file entry in a Git tree.
 * Each entry corresponds to a single file in the repository
 * and contains its blob SHA and last commit information.
 */
export type FileEntry = {
  /** The full relative path of the file within the repository */
  path: string;

  /** The full blob SHA of the file at the current commit */
  blobSha: string;

  /** A short (7-character) version of the blob SHA */
  shortBlobSha: string;

  /** The full SHA of the last commit that modified this file */
  lastCommitSha: string;

  /** A short (7-character) version of the last commit SHA */
  shortCommitSha: string;
};

/**
 * Represents a single commit that touched a specific file.
 */
export type CommitEntry = {
  /** The commit SHA */
  sha: string;

  /** The ISO-8601 timestamp of when the commit was authored */
  date: string;
};

/**
 * Summarizes the relationship between two Git branches or commits.
 * Typically used to determine how a fork branch compares to an upstream branch.
 */
export type CommitSummary = {
  /**
   * The overall status of the branch comparison.
   * - `'upToDate'` - The branch is fully synchronized with its upstream.
   * - `'ahead'` - The branch has commits not present in upstream.
   * - `'behind'` - The branch is missing commits from upstream.
   * - `'diverged'` - Both the branch and upstream have unique commits.
   * - `'unrelated'` - The branches have no common history.
   * - `'unknown'` - The relationship could not be determined.
   */
  status: 'upToDate' | 'ahead' | 'behind' | 'diverged' | 'unrelated' | 'unknown';

  /** Number of commits this branch is ahead of the upstream/target branch */
  commitsAhead: number;

  /** Number of commits this branch is behind the upstream/target branch */
  commitsBehind: number;

  /** Optional SHA of the shared ancestor commit, if available */
  sharedAncestorSha?: string;

  /** Optional ISO timestamp of the last successful sync */
  lastSyncedAt?: string;

  /**
   * Indicates how much of the commit history was successfully analyzed.
   * - `'complete'` - All history was retrieved
   * - `'partial'` - Only part of the history was retrieved
   * - `'unknown'` - History coverage could not be determined
   */
  historyCoverage: 'complete' | 'partial' | 'unknown';
};

/**
 * Represents the recommended merge strategy for a specific file when syncing branches.
 * Used to determine whether to keep, remove, or manually resolve a file
 * based on differences between a fork and its upstream.
 */
export type FileMergeStrategy = {
  /**
   * The recommended strategy for handling this file.
   * - `'keep-fork'` - Keep the version from the fork
   * - `'keep-upstream'` - Use the version from upstream
   * - `'remove-from-fork'` - Remove the file from the fork
   * - `'remove-from-upstream'` - Remove the file from upstream
   * - `'manual'` - Requires manual resolution
   * - `'unknown'` - Strategy could not be determined
   */
  strategy: 'keep-fork' | 'keep-upstream' | 'remove-from-fork' | 'remove-from-upstream' | 'manual' | 'unknown';

  /** Reason or explanation why this strategy was chosen */
  reason: string;
};
