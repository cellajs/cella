import type { FileAnalysis } from '#/types';
import type { SyncService } from './sync-services';

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC API - for cella.config.ts
// ─────────────────────────────────────────────────────────────────────────────

/**
 * User-configurable sync options for cella.config.ts.
 */
export interface UserSyncConfig {
  /** Upstream repository settings */
  upstream: {
    /** Remote URL (e.g., 'git@github.com:cellajs/cella.git') */
    remoteUrl: string;
    /** Branch to sync from */
    branch: string;
    /** Git remote name (e.g., 'cella-upstream') */
    remoteName: string;
  };

  /** Fork repository settings */
  fork: {
    /** Your fork's working branch */
    branch: string;
    /** Temporary branch for sync operations */
    syncBranch: string;
  };

  /** Logging options */
  log?: {
    modules?: LogModule[];
    analyzedFile?: {
      filePath?: string[];
      commitSummaryState?: NonNullable<FileAnalysis['commitSummary']>['status'][];
      mergeStrategyStrategy?: NonNullable<FileAnalysis['mergeStrategy']>['strategy'][];
    };
  };

  /** Behavior options */
  behavior?: {
    packageJsonSync?: string[];
    maxGitPreviewsForSquashCommits?: number;
  };

  /** File overrides */
  overrides?: {
    customized?: string[];
    ignored?: string[];
  };
}

/** Vite-style helper for cella.config.ts with full intellisense. */
export function defineConfig(config: UserSyncConfig): UserSyncConfig {
  return config;
}

// ─────────────────────────────────────────────────────────────────────────────
// INTERNAL TYPES - for sync modules
// ─────────────────────────────────────────────────────────────────────────────

/** Log module names */
export type LogModule = 'analyzedFile' | 'analyzedSummary' | 'packageSummary';

/** Repository config with computed runtime properties */
export interface RepoConfig {
  localPath: string;
  remoteUrl: string;
  branch: string;
  remoteName: string;
  syncBranch: string;
  location: 'local' | 'remote';
  type: 'fork' | 'upstream';
  isRemote: boolean;
  branchRef: string;
  syncBranchRef: string;
  repoReference: string;
  workingDirectory: string;
}

/** Base repo config (stored in state, before computed props) */
export interface BaseRepoConfig {
  localPath: string;
  remoteUrl: string;
  branch: string;
  remoteName: string;
  syncBranch: string;
}

/** Log config with defaults applied */
export interface LogConfig {
  modules: LogModule[];
  analyzedFile: {
    filePath?: string[];
    commitSummaryState?: NonNullable<FileAnalysis['commitSummary']>['status'][];
    mergeStrategyStrategy?: NonNullable<FileAnalysis['mergeStrategy']>['strategy'][];
  };
}

/** Behavior config with defaults applied */
export interface BehaviorConfig {
  packageJsonSync: string[];
  maxGitPreviewsForSquashCommits: number;
}

/** Overrides config with defaults applied */
export interface OverridesConfig {
  customized: string[];
  ignored: string[];
}

/** Full internal sync state */
export interface SyncState {
  syncService: SyncService;
  debug: boolean;
  skipPackages: boolean;
  fork: BaseRepoConfig;
  forkLocation: 'local' | 'remote';
  upstream: BaseRepoConfig;
  upstreamLocation: 'local' | 'remote';
  log: LogConfig;
  behavior: BehaviorConfig;
  overrides: OverridesConfig;
}
