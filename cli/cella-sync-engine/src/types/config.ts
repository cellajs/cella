/**
 * Configuration object for specifying a repository to be analyzed.
 * This can represent either a local repository on disk or a remote GitHub repository.
 * This configuration is used for both: boilerplate and fork repositories.
 */
export type RepoConfig = {
  /**
   * Determines whether the repository is local or remote.
   * - If `use` is `"local"`, you must provide a valid `filePath`.
   * - If `use` is `"remote"`, you must specify `owner`, `repo` and `remoteUrl`.
   */
  use: "local" | "remote";

  /**
   * The absolute path to the local repository on disk.
   * Required if `use` is `"local"`.
   */
  repoPath: string;

  /**
   * The remote URL
   * Required if `use` is `"remote"`. 
   */
  remoteUrl?: string;

  /**
   * The branch name
   * - In the boilerplate, this is the branch to sync from.
   * - In the fork, this is the branch to sync into.
   */
  branch: string;

  /**
   * (Optional) The target branch to apply resolved (squashed) commits into.
   * - Only used in the fork configuration, where after syncing into the `branch`,
   *   the changes will be squashed and merged into this `targetBranch`.
   */
  targetBranch?: string;

  /**
   * Name to add the remote as
   */
  remoteName: string;

  /** 
   * @todo: I think we can remove this, but for now keep it
   * GitHub owner or organization name 
   * Required if `use` is `"remote"`.
   * 
   */
  owner: string;

  /** 
   * @todo: I think we can remove this, but for now keep it
   * GitHub repository name
   * Required if `use` is `"remote"`.
   */
  repo: string;
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
   * Behavior when the remote repository already exists but has a different URL than expected.
   * - 'overwrite': Update the remote URL to the expected one.
   * - 'error': Throw an error and halt the operation.
   */
  onRemoteWrongUrl?: 'overwrite' | 'error'; 
};