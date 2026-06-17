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
  | 'overrides'
  | 'pnpm';

/** Merge strategy for syncing upstream changes */
type MergeStrategy = 'merge' | 'squash';

/**
 * Sync settings - all configurable options for the sync CLI.
 * Hover over each property for documentation.
 */
export interface SyncSettings {
  /** Upstream repository URL (e.g., 'git@github.com:cellajs/cella.git') */
  upstreamUrl: string;

  /** Upstream branch to sync from (e.g., 'development') */
  upstreamBranch: string;

  /**
   * Optional commit SHA to pin upstream to. When set, analyze/sync operations
   * fetch and diff against this exact commit instead of the tip of `upstreamBranch`.
   * Bump via PR to make upstream changes reviewable — analogous to a lockfile entry
   * for the upstream template. Recommended for CI to defend against a compromised
   * upstream pushing unreviewed commits between sync runs.
   *
   * Example: 'a1b2c3d4e5f6...' (full 40-char SHA)
   */
  upstreamPinnedSha?: string;

  /** Git remote name for upstream (default: 'cella-upstream') */
  upstreamRemoteName?: string;

  /** This repo's working branch that upstream changes are synced into (e.g., 'development') */
  workingBranch: string;

  /** Which package.json keys to sync (default: ['dependencies', 'devDependencies']) */
  packageJsonSync?: PackageJsonSyncKey[];

  /**
   * Merge strategy for syncing upstream changes.
   * Both use real git merge internally for correct 3-way merge and merge-base tracking.
   * - 'merge': Leaves merge state for user to commit (merge commit with full ancestry).
   * - 'squash' (default): Auto-commits as single-parent when clean. Falls back to merge
   *   commit (with IDE 3-way support) when there are conflicts.
   */
  mergeStrategy?: MergeStrategy;

  /**
   * Automatically run packages sync after the sync service completes.
   * When true (default), the packages service is hidden from the menu
   * and runs automatically as part of sync.
   * Set to false to keep packages as a separate manual service.
   */
  syncWithPackages?: boolean;

  /**
   * How to link files in CLI output.
   * - 'commit' (default): Link to the commit that changed the file on GitHub.
   * - 'file': Link to the file in the repo at the upstream branch on GitHub.
   * - 'local': Open the file in VS Code from a local upstream clone (requires upstreamLocalPath).
   */
  fileLinkMode?: 'commit' | 'file' | 'local';

  /**
   * Path to a local clone of the upstream repo for 'local' linkStyle.
   * Example: '../cella' or '/Users/you/Sites/cella'
   */
  upstreamLocalPath?: string;
}

/**
 * Configuration for a downstream fork repository that cella interacts with.
 *
 * Cella is the upstream/source-of-truth. For each fork it can:
 * - pull contributions FROM the fork's `pullBranch` (contributions service)
 * - sync changes INTO the fork's `pushBranch` (forks service)
 */
export interface ForkConfig {
  /** Display name for the fork (also used as the contrib/<name> branch slug) */
  name: string;
  /** Local path to the fork repository (relative to this config or absolute) */
  localPath: string;
  /** Fork branch that cella pulls contributions from (contributions service) */
  pullBranch: string;
  /** Fork branch that cella syncs changes into (forks service) */
  pushBranch: string;
}

/**
 * User-configurable sync options for cella.config.ts.
 * Simplified for v2 - no sync branch or squash options.
 */
export interface CellaCliConfig {
  /** Core sync settings */
  settings: SyncSettings;

  /**
   * File overrides for controlling sync behavior per folder/file.
   */
  overrides?: {
    /**
     * Folders (or exact paths) the fork fully owns — never synced (existing or new).
     * Directory prefixes, not globs: 'bench' matches 'bench/' and everything under it,
     * 'README.md' matches that exact file.
     * Local territory: upstream cannot add, modify, or delete anything under these.
     */
    ignoredFolders?: string[];

    /**
     * Exact files pinned to fork — fork wins on conflicts.
     * Exact paths only (no wildcards - use ignoredFolders for whole folders).
     * Non-conflicting upstream changes merge normally.
     * If fork deleted a pinned file, deletion is respected.
     */
    pinnedFiles?: string[];
  };

  /**
   * Downstream fork repositories that cella interacts with (for upstream template repos).
   * When configured, the 'forks' and 'contributions' services appear in the CLI menu.
   */
  forks?: ForkConfig[];
}

/**
 * Helper function for defining cella.config.ts with type checking.
 */
export function defineConfig(config: CellaCliConfig): CellaCliConfig {
  return config;
}

// ─────────────────────────────────────────────────────────────────────────────
// INTERNAL TYPES - for sync modules
// ─────────────────────────────────────────────────────────────────────────────

/** Sync services available in the CLI */
export type SyncService = 'analyze' | 'sync' | 'audit' | 'forks' | 'contributions' | 'stats';

/** Analyze output scope for interactive and machine-readable flows */
export type AnalyzeScope = 'all' | 'risk' | 'protected';

/** Runtime configuration with all resolved values */
export interface RuntimeConfig extends CellaCliConfig {
  /** Resolved fork repository path */
  forkPath: string;

  /** Full upstream remote ref (e.g., 'cella-upstream/development') */
  upstreamRef: string;

  /** Selected sync service */
  service: SyncService;

  /** Write full file list to log file */
  logFile: boolean;

  /** Non-interactive list output (for LLM/agent usage) */
  list: boolean;

  /** Machine-readable JSON output (for tooling/agent usage) */
  json: boolean;

  /** Print the unified diff for a single contributed file, then exit (contributions; for tooling/agents) */
  diff?: string;

  /** Open a VS Code side-by-side diff for one file, then exit (analyze) */
  openDiff?: string;

  /** Scope of files returned in analyze list/json output */
  scope?: AnalyzeScope;

  /** Show verbose output */
  verbose: boolean;

  /** Pre-selected fork name (skips fork selection prompt) */
  fork?: string;

  /** Overwrite drifted files with upstream version (aggressive realignment) */
  hard?: boolean;

  /** Bypass pnpm metadata cache for fresh registry data (audit service) */
  force?: boolean;

  /** Check which pnpm.overrides are still needed (audit service) */
  checkOverrides?: boolean;

  /** Regenerate test coverage before showing the stats summary (stats service) */
  coverage?: boolean;
}

/** File status after analysis */
export type FileStatus =
  | 'identical' // No changes needed
  | 'ahead' // Fork is ahead, protected (pinned/ignored)
  | 'local' // Local file (never existed upstream)
  | 'drifted' // Fork is ahead, NOT protected (at risk)
  | 'behind' // Upstream has changes to sync
  | 'diverged' // Both changed, will merge
  | 'pinned' // Fork wins on conflict
  | 'ignored' // Excluded from sync entirely
  | 'deleted' // Fork deleted, will stay deleted
  | 'renamed'; // Upstream renamed file

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
  /** For diverged files: relative date of upstream change */
  upstreamChangedAt?: string;
  /** For diverged files: short commit hash of the upstream change */
  upstreamCommit?: string;
  /** For renamed files: the original path before rename */
  renamedFrom?: string;
}

/** Summary counts by status */
export interface AnalysisSummary {
  identical: number;
  ahead: number;
  local: number;
  drifted: number;
  behind: number;
  diverged: number;
  pinned: number;
  ignored: number;
  deleted: number;
  renamed: number;
  total: number;
}

/** Merge result from merge-engine */
export interface MergeResult {
  success: boolean;
  /** Upstream branch name for file links */
  upstreamBranch?: string;
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
  /** Whether the sync was auto-committed (squash strategy with no conflicts) */
  autoCommitted?: boolean;
}
