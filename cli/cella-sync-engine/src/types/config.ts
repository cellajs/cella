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

  /**
   * Module: all
   * Whether to skip all git push operations.
   */
  skipAllPushes?: boolean;
};