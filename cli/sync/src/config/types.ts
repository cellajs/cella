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
   * Main branch name to work with (e.g., 'development').
   * This is your fork's primary branch where final changes land.
   */
  branch: string;

  /**
   * Name of the remote (e.g., 'origin').
   */
  remoteName: string;

  /**
   * Intermediate branch used for sync operations.
   * Upstream changes are first merged into this branch, conflicts resolved,
   * then squash-merged into the main branch. This keeps your main branch
   * history clean while preserving full merge history in the sync branch.
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
  };
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
  };
}

/**
 * Configuration for specifying behavior during sync operations.
 */
export interface MinimalBehaviorConfig {
  /**
   * Root keys in package.json to sync from upstream.
   * Only updates values where the key already exists in fork.
   * Supports objects (dependencies, scripts), arrays (browserslist), and primitives (version).
   * @default ['dependencies', 'devDependencies']
   */
  packageJsonSync?: string[];

  /**
   * Whether to skip writing the swizzle metadata file.
   * If true, the swizzle metadata file will not be written.
   */
  skipWritingSwizzleMetadataFile?: boolean;

  /**
   * Maximum number of git previews for squash commits.
   */
  maxGitPreviewsForSquashCommits?: number;
}

export interface MinimalOverridesConfig {
  /**
   * Local file system path (directory) to find metadata in
   */
  localDir: string;

  /**
   * Version of the overrides metadata format (update when schema changes)
   */
  metadataVersion: string;

  /**
   * Default metadata file name
   * Stores information about auto-detected overridden files
   */
  metadataFileName: string;

  /**
   * Files customized in fork; prefer fork version during merge conflicts
   */
  customized: string[];

  /**
   * Files and directories to be fully ignored during sync
   */
  ignored: string[];
}

/**
 * Sync configuration for the Cella sync CLI.
 * Defines the synchronization service type and repository configurations.
 */
export interface SyncConfig {
  /**
   * Type of synchronization service being used.
   */
  syncService: SyncService;

  /**
   * Whether debug mode is enabled (verbose output).
   */
  debug: boolean;

  /**
   * Whether to skip package.json sync during sync service.
   */
  skipPackages: boolean;

  /**
   * Configuration for the forked repository.
   */
  fork: MinimalRepoConfig;
  forkLocation: 'local' | 'remote';

  /**
   * Configuration for the upstream repository.
   */
  upstream: MinimalRepoConfig;
  upstreamLocation: 'local' | 'remote';

  /**
   * Configuration for logging analyzed results.
   */
  log: MinimalLogConfig;

  /**
   * Configuration for specifying behavior during sync operations.
   */
  behavior: MinimalBehaviorConfig;

  /**
   * Configuration related to overrides metadata and settings files.
   */
  overrides: MinimalOverridesConfig;
}

/**
 * User-configurable sync options for cella.config.ts.
 * Excludes runtime properties like syncService, debug, skipPackages.
 *
 * upstream and fork are required, behavior/log/overrides are optional with defaults.
 */
export interface UserSyncConfig {
  /** Configuration for the upstream repository (required) */
  upstream: {
    /** Remote URL of the upstream repository (e.g., 'git@github.com:cellajs/cella.git') */
    remoteUrl: string;
    /** Branch to sync from in the upstream repository */
    branch: string;
    /** Git remote name for the upstream (e.g., 'cella-upstream') */
    remoteName: string;
  };
  /** Configuration for the forked repository (required) */
  fork: {
    /** Your fork's working branch where final changes land */
    branch: string;
    /** Temporary branch for sync operations (local-only, keeps main branch history clean) */
    syncBranch: string;
  };
  /** Configuration for logging analyzed results (optional) */
  log?: DeepPartial<MinimalLogConfig>;
  /** Configuration for specifying behavior during sync operations (optional) */
  behavior?: DeepPartial<MinimalBehaviorConfig>;
  /** Configuration related to overrides metadata and settings files (optional) */
  overrides?: DeepPartial<Pick<MinimalOverridesConfig, 'customized' | 'ignored'>>;
}

/**
 * A utility type that makes all properties of a given type T optional, including nested properties.
 */
type DeepPartial<T> = T extends (infer U)[] // If T is an array
  ? DeepPartial<U>[] // Make its elements DeepPartial, but keep array shape
  : T extends object // If T is an object
    ? { [P in keyof T]?: DeepPartial<T[P]> }
    : T; // Otherwise primitive — leave as-is

/**
 * Define sync configuration with full type inference (Vite-style helper).
 * Provides intellisense for all user-configurable options.
 *
 * @example
 * export default defineConfig({
 *   upstream: { remoteUrl: '...', branch: 'main', remoteName: 'upstream' },
 *   fork: { branch: 'main', syncBranch: 'sync-branch' },
 * })
 */
export function defineConfig(config: UserSyncConfig): UserSyncConfig {
  return config;
}
