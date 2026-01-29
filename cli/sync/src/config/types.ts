/**
 * Sync CLI v2 - Configuration Types
 *
 * Simplified configuration for worktree-based merge approach.
 */

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC API - for cella.config.ts
// ─────────────────────────────────────────────────────────────────────────────

/** Valid package.json keys that can be synced */
export type PackageJsonSyncKey =
  | 'dependencies'
  | 'devDependencies'
  | 'peerDependencies'
  | 'optionalDependencies'
  | 'scripts'
  | 'engines'
  | 'packageManager'
  | 'overrides';

/**
 * Sync settings - all configurable options for the sync CLI.
 * Hover over each property for documentation.
 */
export interface SyncSettings {
  /** Upstream repository URL (e.g., 'git@github.com:cellajs/cella.git') */
  upstreamUrl: string;

  /** Upstream branch to sync from (e.g., 'development') */
  upstreamBranch: string;

  /** Git remote name for upstream (default: 'cella-upstream') */
  upstreamRemoteName?: string;

  /** Your fork's working branch (e.g., 'development') */
  forkBranch: string;

  /** Which package.json keys to sync (default: ['dependencies', 'devDependencies']) */
  packageJsonSync?: PackageJsonSyncKey[];
}

/**
 * User-configurable sync options for cella.config.ts.
 * Simplified for v2 - no sync branch or squash options.
 */
export interface CellaSyncConfig {
  /** Core sync settings */
  settings: SyncSettings;

  /**
   * File overrides for controlling sync behavior per file/pattern.
   */
  overrides?: {
    /**
     * Files ignored entirely during sync — never synced (existing or new).
     * Supports glob patterns (e.g., 'frontend/public/static/*').
     * Fork-only territory: upstream cannot add, modify, or delete these.
     */
    ignored?: string[];

    /**
     * Files pinned to fork — fork wins on conflicts.
     * Exact paths only (no wildcards - use ignored for patterns).
     * Non-conflicting upstream changes merge normally.
     * If fork deleted a pinned file, deletion is respected.
     */
    pinned?: string[];
  };
}

/**
 * Helper function for defining cella.config.ts with type checking.
 */
export function defineConfig(config: CellaSyncConfig): CellaSyncConfig {
  return config;
}

// ─────────────────────────────────────────────────────────────────────────────
// INTERNAL TYPES - for sync modules
// ─────────────────────────────────────────────────────────────────────────────

/** Sync services available in the CLI */
export type SyncService = 'analyze' | 'sync' | 'packages';

/** Runtime configuration with all resolved values */
export interface RuntimeConfig extends CellaSyncConfig {
  /** Resolved fork repository path */
  forkPath: string;

  /** Full upstream remote ref (e.g., 'cella-upstream/development') */
  upstreamRef: string;

  /** Selected sync service */
  service: SyncService;

  /** Write full file list to log file */
  logFile: boolean;

  /** Show verbose output */
  verbose: boolean;
}

/** File status after analysis */
export type FileStatus =
  | 'identical' // No changes needed
  | 'ahead' // Fork is ahead, protected (pinned/ignored)
  | 'drifted' // Fork is ahead, NOT protected (at risk)
  | 'behind' // Upstream has changes to sync
  | 'diverged' // Both changed, will merge
  | 'pinned' // Fork wins on conflict
  | 'ignored' // Excluded from sync entirely
  | 'deleted'; // Fork deleted, will stay deleted

/** Analyzed file with status and metadata */
export interface AnalyzedFile {
  path: string;
  status: FileStatus;
  /** True if file is in ignored list */
  isIgnored: boolean;
  /** True if file is in pinned list */
  isPinned: boolean;
  /** True if file exists in fork */
  existsInFork: boolean;
  /** True if file exists in upstream */
  existsInUpstream: boolean;
  /** True if file has merge conflict */
  hasConflict?: boolean;
  /** Relative date when file was last changed (since merge-base) */
  changedAt?: string;
  /** Short commit hash of the last change */
  changedCommit?: string;
}

/** Summary counts by status */
export interface AnalysisSummary {
  identical: number;
  ahead: number;
  drifted: number;
  behind: number;
  diverged: number;
  pinned: number;
  ignored: number;
  deleted: number;
  total: number;
}

/** Merge result from merge-engine */
export interface MergeResult {
  success: boolean;
  files: AnalyzedFile[];
  summary: AnalysisSummary;
  worktreePath: string;
  conflicts: string[];
  /** Upstream GitHub URL base for commit links */
  upstreamGitHubUrl?: string;
  /** Fork GitHub URL base for commit links */
  forkGitHubUrl?: string;
  /** Upstream commit info */
  upstreamCommit?: {
    hash: string;
    message: string;
    date: string;
  };
}
