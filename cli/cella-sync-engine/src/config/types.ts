import type { FileAnalysis } from '../types';

/**
 * Minimal configuration required to identify and work with a Git repository.
 */
export interface MinimalRepoConfig {
  /**
   * Local file system path to the Git repository.
   */
  localPath: string;

  /**
   * Remote URL of the Git repository.
   */
  remoteUrl: string;

  /**
   * Branch name to work with (e.g., 'development').
   */
  branch: string;

  /**
   * Name of the remote (e.g., 'origin').
   */
  remoteName: string;

  /**
   * Branch used for synchronization operations.
   */
  syncBranch: string;
}

/**
 * Types of log modules available for logging analyzed results.
 */
type LogModule = 'analyzedFile' | 'analyzedSummary' | 'analyzedSwizzle';

/**
 * Configuration for logging analyzed results
 */
export interface MinimalLogConfig {
  /**
   * Modules to log analyzed results for:
   * Options: 'analyzedFile' | 'analyzedSummary' | 'analyzedSwizzle'
   */
  modules?: LogModule[];

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
     */
    commitSummaryState?: NonNullable<FileAnalysis['commitSummary']>['status'][];

    /**
     * Filters to filter analyzed files by merge strategy strategy
     */
    mergeStrategyStrategy?: NonNullable<FileAnalysis['mergeStrategy']>['strategy'][];
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
 * Application configuration for the Cella Sync Engine.
 * Defines the synchronization service type and repository configurations.
 */
export interface AppConfig {
  /**
   * Type of synchronization service being used.
   */
  syncService: 'boilerplate-fork' | 'boilerplate-fork+packages' | 'packages' | 'diverged';

  /**
   * Configuration for the forked repository.
   */
  fork: MinimalRepoConfig;
  forkUse: 'local' | 'remote';

  
  /**
   * Configuration for the boilerplate repository.
   */
  boilerplate: MinimalRepoConfig;
  boilerplateUse: 'local' | 'remote';

  /**
   * Configuration for logging analyzed results.
   */
  log: MinimalLogConfig,
}