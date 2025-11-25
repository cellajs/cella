import type { FileAnalysis } from '../types';
import { SyncService } from './sync-services';

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
type LogModule = 'analyzedFile' | 'analyzedSummary' | 'analyzedSwizzle' | 'packageSummary';

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
 * Configuration for specifying behavior during sync operations.
 */
export interface MinimalBehaviorConfig {
  /**
   * Behavior when the remote repository already exists but has a different URL than expected.
   * - 'overwrite': Update the remote URL to the expected one.
   * - 'error': Throw an error and halt the operation.
   */
  onRemoteWrongUrl?: 'overwrite' | 'error';

  /**
   * Behavior when the remote is missing and some commands require it (for example a `git pull`)
   * Options:
   * - 'skip': Skip operations that require the upstream remote.
   * - 'error': Throw an error and halt the operation.
   */
  onMissingRemote?: 'skip' | 'error';

  /**
   * Whether to skip all git push operations.
   */
  skipAllPushes?: boolean;

  /**
   * Whether to perform a dry run for package.json changes.
   * If true, changes to package.json will not be written, only displayed.
   */
  dryRunPackageJsonChanges?: boolean;

  /**
   * Whether to skip writing the swizzle metadata file.
   * If true, the swizzle metadata file will not be written.
   */
  skipWritingSwizzleMetadataFile?: boolean;
}

export interface MinimalSwizzleConfig {
  /**
   * Local file system path (directory) to find metadata in
   */
  localDir: string;
  
  /**
   * Version of the swizzle metadata format (update when schema changes)
   */
  metadataVersion: string,

  /**
   * Default metadata file name
   * Stores information about (auto detect) swizzled files
   */
  metadataFileName: string,

  /**
   * Stores user-defined flags of 'edited' files for swizzling 
   */
  editedFiles: string[],

  /**
   * Stores user-defined flags of 'removed' files for swizzling
   */
  removedFiles: string[],
}

/**
 * Application configuration for the Cella Sync Engine.
 * Defines the synchronization service type and repository configurations.
 */
export interface AppConfig {
  /**
   * Type of synchronization service being used.
   */
  syncService: SyncService;

  /**
   * Configuration for the forked repository.
   */
  fork: MinimalRepoConfig;
  forkLocation: 'local' | 'remote';


  /**
   * Configuration for the boilerplate repository.
   */
  boilerplate: MinimalRepoConfig;
  boilerplateLocation: 'local' | 'remote';

  /**
   * Configuration for logging analyzed results.
   */
  log: MinimalLogConfig,

  /**
   * Configuration for specifying behavior during sync operations.
   */
  behavior: MinimalBehaviorConfig,

  /**
   * Configuration related to swizzle metadata and settings files.
   */
  swizzle: MinimalSwizzleConfig,
}

/**
 * A utility type that makes all properties of a given type T optional, including nested properties.
 */
export type DeepPartial<T> =
  T extends (infer U)[]       // If T is an array
    ? DeepPartial<U>[]        // Make its elements DeepPartial, but keep array shape
    : T extends object        // If T is an object
      ? { [P in keyof T]?: DeepPartial<T[P]> }
      : T;                    // Otherwise primitive — leave as-is