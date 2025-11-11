/**
 * Configuration object for specifying a repository to be analyzed.
 * This can represent either a local repository on disk or a remote GitHub repository.
 * This configuration is used for both: boilerplate and fork repositories.
 */
export type RepoConfig = {
  /**
   * Determines whether the repository is local or remote.
   * - If `use` is `"local"`, you must provide a valid `filePath`.
   * - If `use` is `"remote"`, you must specify `remoteUrl`.
   */
  use: "local" | "remote";

  /**
   * The absolute path to the local repository on disk.
   * - For `local` repos, this is the direct path to the repo
   * - For `remote` repos, this is the path where the repo was cloned to (fork path)
   */
  repoPath: string;

  /**
   * The remote URL
   * - Required if `use` is `"remote"`. 
   */
  remoteUrl: string;

  /**
   * The branch name
   * - In the boilerplate, this is the branch to sync from.
   * - In the fork, this is the branch to sync into.
   */
  branch: string;

  /**
   * The target branch to apply resolved (squashed) commits into.
   * - Only used in the fork configuration, where after syncing into the `branch`,
   *   the changes will be squashed and merged into this `targetBranch`.
   */
  targetBranch: string;

  /**
   * Name to add the remote as
   */
  remoteName: string;
};

/**
 * Configuration for logging analyzed results
 */
export type Log = {
  /**
   * Modules to log analyzed results for:
   * Options: 'analyzedFile' | 'analyzedSummary' | 'analyzedSwizzle'
   */
  modules?: string[];

  /**
   * Filters to filter analyzed files
   */
  analyzedFile: {
    /**
     * Filters to filter analyzed files by file path
     */
    filePath?: string[];

    /**
     * Filters to filter analyzed files by commit summary state
     * Options: 'upToDate' | 'ahead' | 'behind' | 'diverged' | 'unrelated'
     */
    commitSummaryState?: string[];

    /**
     * Filters to filter analyzed files by merge strategy strategy
     * Options: 'keep-fork' | 'keep-boilerplate' | 'remove-from-fork' | 'remove-from-boilerplate' | 'manual' | 'unknown'
     */
    mergeStrategyStrategy?: string[];
  },
  /**
   * Filters to filter analyzed swizzle entries
   */
  analyzedSwizzle: {
    /**
     * Filters to filter analyzed swizzle entries by file path
     */
    filePath?: string[];

    /**
     * Indicates whether to log only swizzled or non-swizzled files
     * Dont include to log all files
     */
    swizzled?: boolean;
  }
}

/**
 * Configuration for specifying behavior during sync operations
 * - e.g., how to handle certain edge cases?
 */
export type BehaviorConfig = {
  /**
   * Module: run-preflight
   * Behavior when the remote repository already exists but has a different URL than expected.
   * - 'overwrite': Update the remote URL to the expected one.
   * - 'error': Throw an error and halt the operation.
   */
  onRemoteWrongUrl?: 'overwrite' | 'error';

  /**
   * Module: run-preflight
   * Behavior when the upstream remote is missing and some commands require it (for example a `git pull`)
   * Options:
   * - 'skip': Skip operations that require the upstream remote.
   * - 'error': Throw an error and halt the operation.
   */
  onMissingUpstream?: 'skip' | 'error';
};