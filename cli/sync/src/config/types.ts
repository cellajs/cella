import type { SyncService } from './sync-services';

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
 * User-configurable sync options for cella.config.ts.
 * Flat structure for simplicity and clarity.
 */
export interface CellaSyncConfig {
  /** Upstream repository URL (e.g., 'git@github.com:cellajs/cella.git') */
  upstreamUrl: string;

  /** Upstream branch to sync from (e.g., 'development') */
  upstreamBranch: string;

  /** Git remote name for upstream (default: 'cella-upstream') */
  upstreamRemoteName?: string;

  /** Your fork's working branch (e.g., 'development') */
  forkBranch: string;

  /** Branch for sync operations, maintains full upstream history (default: 'sync-branch') */
  forkSyncBranch?: string;

  /** Show all file details (default: false, shows only files needing attention) */
  verbose?: boolean;

  /** Max commits to show in squash commit preview (default: 30) */
  maxSquashPreviews?: number;

  /** Which package.json keys to sync (default: ['dependencies', 'devDependencies']) */
  packageJsonSync?: PackageJsonSyncKey[];

  /**
   * File overrides for controlling sync behavior per file/pattern.
   * Supports glob patterns (e.g., 'frontend/public/static/*').
   */
  overrides?: {
    /**
     * Files pinned to fork — your version is preferred during merge conflicts.
     * Use for files you've customized but still want to receive non-conflicting updates.
     * Example: config files, routes, branding assets.
     */
    pinned?: string[];

    /**
     * Files ignored entirely during sync — upstream changes are never applied.
     * Use for app-specific files that should never sync with upstream.
     * Example: your app's docs, custom modules, local configs.
     */
    ignored?: string[];
  };
}

export function defineConfig(config: CellaSyncConfig): CellaSyncConfig {
  return config;
}

// ─────────────────────────────────────────────────────────────────────────────
// INTERNAL TYPES - for sync modules
// ─────────────────────────────────────────────────────────────────────────────

/** Repository config object passed to generic functions */
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

/** Overrides config with defaults applied */
export interface OverridesConfig {
  pinned: string[];
  ignored: string[];
}

/** Full internal sync state with flat structure */
export interface SyncState {
  syncService: SyncService;
  debug: boolean;
  verbose: boolean;
  skipPackages: boolean;
  maxSquashPreviews: number;
  packageJsonSync: PackageJsonSyncKey[];

  // Fork settings
  forkLocalPath: string;
  forkBranch: string;
  forkSyncBranch: string;
  forkLocation: 'local' | 'remote';

  // Upstream settings
  upstreamUrl: string;
  upstreamBranch: string;
  upstreamRemoteName: string;
  upstreamLocation: 'local' | 'remote';

  overrides: OverridesConfig;
}
