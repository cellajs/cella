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

  /** Show all file details (default: false, shows only files needing attention) */
  verbose?: boolean;

  /** Max commits to show in squash commit preview (default: 30) */
  maxSquashPreviews?: number;

  /** Which package.json keys to sync (default: ['dependencies', 'devDependencies']) */
  packageJsonSync?: PackageJsonSyncKey[];

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

/** Overrides config with defaults applied */
export interface OverridesConfig {
  customized: string[];
  ignored: string[];
}

/** Full internal sync state */
export interface SyncState {
  syncService: SyncService;
  debug: boolean;
  verbose: boolean;
  skipPackages: boolean;
  maxSquashPreviews: number;
  packageJsonSync: PackageJsonSyncKey[];
  fork: BaseRepoConfig;
  forkLocation: 'local' | 'remote';
  upstream: BaseRepoConfig;
  upstreamLocation: 'local' | 'remote';
  overrides: OverridesConfig;
}
