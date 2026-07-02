/**
 * Sync CLI v2 - Configuration Types
 *
 * Simplified configuration for worktree-based merge approach.
 */

import { z } from 'zod';

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

/**
 * Sync settings - all configurable options for the sync CLI.
 * Hover over each property for documentation.
 */
export interface SyncSettings {
  /** Upstream repository URL (e.g., 'git@github.com:cellajs/cella.git') */
  upstreamUrl: string;

  /**
   * Upstream branch, used for `upstreamTrack: 'branch'` and for GitHub file links.
   * Defaults to 'main'.
   */
  upstreamBranch?: string;

  /**
   * How to track upstream cella. Defaults to 'release'.
   * - 'release' (default): sync to a published cella release tag (`v*`). Stable and
   *   reviewable — each bump maps to a changelog. Uses the latest release.
   * - 'branch': follow the bleeding-edge tip of `upstreamBranch`. For cella
   *   maintainers and forks doing active development on top of unreleased changes.
   */
  upstreamTrack?: 'release' | 'branch';

  /**
   * Branch a fork receives upstream syncs on via the **forks** (maintainer→fork) service.
   * Defaults to 'cella-sync'. This is a real, checked-out branch in the fork clone that a
   * cella maintainer pushes onto; it is the single source of truth read from the fork's own
   * config when cella pushes downstream.
   *
   * Note: the fork owner's own `pnpm cella sync` does NOT use this branch — it cuts ephemeral
   * `syncBranchPrefix` branches from `releaseBase` instead.
   */
  syncBranch?: string;

  /**
   * Prefix for the ephemeral integration branches that `pnpm cella sync` cuts per run.
   * Defaults to 'cella/sync'.
   *
   * Each run cuts a fresh, uniquely named branch from `releaseBase` (e.g.
   * `cella/sync/20260702-1430-c5a1970`), lands the upstream merge there, and leaves it for you
   * to commit and open a PR into `releaseBase`. Cutting fresh each cycle keeps every PR scoped
   * to that cycle's upstream delta (no accumulation) and keeps `main` linear. The three-segment
   * shape means it never collides with git's ref namespacing (no long-lived `cella-sync`
   * file-vs-dir conflict).
   */
  syncBranchPrefix?: string;

  /**
   * Trunk branch that `pnpm cella sync` cuts the ephemeral branch from and that you open the
   * squash-merge PR into. Defaults to 'main'. Cutting fresh from trunk each cycle keeps every
   * PR limited to that cycle's upstream delta (no accumulation) and `main` linear.
   */
  releaseBase?: string;

  /** Which package.json keys to sync (default: ['dependencies', 'devDependencies']) */
  packageJsonSync?: PackageJsonSyncKey[];

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
   * - 'local': Open the upstream file in VS Code from the auto-managed upstream view worktree.
   */
  fileLinkMode?: 'commit' | 'file' | 'local';
}

/**
 * Configuration for a downstream fork repository that cella interacts with.
 *
 * Cella is the upstream/source-of-truth. For each fork it can:
 * - pull contributions FROM the fork's `pullBranch` (contributions service)
 * - sync changes INTO the fork's own `settings.syncBranch` (forks service)
 */
export interface ForkConfig {
  /** Display name for the fork (also used as the contrib/<name> branch slug) */
  name: string;
  /** Local path to the fork repository (relative to this config or absolute) */
  localPath: string;
  /**
   * Git remote URL of the fork (e.g. 'git@github.com:org/fork.git').
   * When set, the contributions service fetches the fork's `pullBranch` from this
   * remote (the authoritative committed ref) instead of the local clone, so the
   * comparison no longer depends on the local checkout being up to date. The local
   * clone is still used to read the fork's owned-folder territory when available.
   */
  remoteUrl?: string;
  /** Fork branch that cella pulls contributions from (contributions service) */
  pullBranch: string;
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
     * Paths the fork fully owns — never synced (existing or new).
     * Exact paths or directory prefixes, not globs: 'bench' matches 'bench/' and
     * everything under it, 'README.md' matches that exact file.
     * Local territory: upstream cannot add, modify, or delete anything under these.
     */
    ignored?: string[];

    /**
     * Paths pinned to fork — fork wins on conflicts.
     * Exact paths or directory prefixes, not globs: 'bench' matches 'bench/' and
     * everything under it, 'README.md' matches that exact file.
     * Non-conflicting upstream changes merge normally.
     * If fork deleted a pinned file, deletion is respected.
     */
    pinned?: string[];
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

/**
 * Strict runtime schema mirroring {@link CellaCliConfig}.
 *
 * The TS interfaces above stay the source of truth (and keep their hover docs for
 * config authors). This schema is what's enforced at load time: `.strict()` rejects
 * unknown keys, so a typo like `ignoredFolders` instead of `ignored` fails closed
 * instead of silently dropping sync protection (tsx does not typecheck the config).
 *
 * The `satisfies z.ZodType<CellaCliConfig>` assertion keeps schema and interface in
 * lockstep: if either drifts (a renamed/removed/mis-typed field), TypeScript errors here.
 */
export const cellaConfigSchema = z
  .object({
    settings: z
      .object({
        upstreamUrl: z.string().min(1),
        upstreamBranch: z.string().min(1).optional(),
        upstreamTrack: z.enum(['release', 'branch']).optional(),
        syncBranch: z.string().min(1).optional(),
        releaseBase: z.string().min(1).optional(),
        packageJsonSync: z
          .array(
            z.enum([
              'dependencies',
              'devDependencies',
              'peerDependencies',
              'optionalDependencies',
              'scripts',
              'engines',
              'packageManager',
              'overrides',
              'pnpm',
            ]),
          )
          .optional(),
        syncWithPackages: z.boolean().optional(),
        fileLinkMode: z.enum(['commit', 'file', 'local']).optional(),
      })
      .strict(),
    overrides: z
      .object({
        ignored: z.array(z.string()).optional(),
        pinned: z.array(z.string()).optional(),
      })
      .strict()
      .optional(),
    forks: z
      .array(
        z
          .object({
            name: z.string().min(1),
            localPath: z.string().min(1),
            remoteUrl: z.string().optional(),
            pullBranch: z.string().min(1),
          })
          .strict(),
      )
      .optional(),
  })
  .strict() satisfies z.ZodType<CellaCliConfig>;

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

  /**
   * Disable pinned entries (cella.config.ts overrides.pinned) for this sync so upstream
   * versions surface as behind/diverged. package.json files stay pinned (handled
   * by the packages service). Like --hard, uses the natural merge-base to resurface
   * full upstream history.
   */
  unpinned?: boolean;

  /**
   * Override upstream tracking for this run (analyze/sync), ignoring `settings.upstreamTrack`.
   * 'branch' follows the upstream branch tip (bleeding edge); 'release' uses a release tag.
   */
  track?: 'release' | 'branch';

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
  /** Resolved concrete upstream ref that was merged (branch ref or release tag ref) */
  upstreamRef?: string;
  /** Upstream release tag synced (when tracking releases) */
  upstreamTag?: string;
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
  /** Commits included in this sync range (oldest-first when rendered) */
  upstreamCommits?: Array<{
    hash: string;
    message: string;
    date: string;
  }>;
  /** Files that were auto-merged by git (diverged without remaining conflicts) */
  autoMergedFiles?: string[];
  /** Whether the sync was auto-committed (squash strategy with no conflicts) */
  autoCommitted?: boolean;
}
