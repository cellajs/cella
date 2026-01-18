import { resolve } from 'node:path';
import type { BaseRepoConfig, OverridesConfig, PackageJsonSyncKey } from './types';

/** Resolve to monorepo root (cli/sync is 2 levels deep) */
const monorepoRoot = resolve(import.meta.dirname, '../../../..');

// ─────────────────────────────────────────────────────────────────────────────
// Fork Repository Defaults
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Default configuration for the fork repository.
 * The fork repository contains the user's fork of the upstream repository.
 */
export const forkDefaultConfig: BaseRepoConfig = {
  /** Local file system path to the fork repository */
  localPath: monorepoRoot,
  /** The remote URL of the fork repository */
  remoteUrl: '',
  /** Your fork's main branch where final changes land (squashed commits) */
  branch: 'development',
  /**
   * sync-branch maintains full git ancestry with upstream (local-only, never pushed).
   *
   * It contains actual upstream merge commits (not squashed), enabling:
   * - Accurate "commits behind" detection via shared commit SHAs
   * - Proper three-way merges with conflict detection
   * - Git merge-base calculations to work correctly
   *
   * Flow: upstream → sync-branch (full history) → development (squashed)
   */
  syncBranch: 'sync-branch',
  /** The name to use when adding the fork repository as a remote */
  remoteName: '',
};

// ─────────────────────────────────────────────────────────────────────────────
// Upstream Repository Defaults
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Default configuration for the upstream repository.
 * The upstream repository contains the base files and structure.
 */
export const upstreamDefaultConfig: BaseRepoConfig = {
  /** Local file system path to the upstream repository (empty because differs per user) */
  localPath: '',
  /** The remote URL of the upstream repository */
  remoteUrl: 'https://github.com/cellajs/cella.git',
  /** The "branch" to sync from. Make sure this branch exists in the upstream repository */
  branch: 'development',
  /** The sync branch (will differ per user/repo) */
  syncBranch: '',
  /** The name to use when adding the upstream repository as a remote */
  remoteName: 'cella-upstream',
};

// ─────────────────────────────────────────────────────────────────────────────
// Sync Options Defaults
// ─────────────────────────────────────────────────────────────────────────────

/** Default: show only files needing attention */
export const verboseDefault = false;

/** Default: max commits to show in squash preview */
export const maxSquashPreviewsDefault = 30;

/** Default: which package.json keys to sync */
export const packageJsonSyncDefault: PackageJsonSyncKey[] = ['dependencies', 'devDependencies'];

// ─────────────────────────────────────────────────────────────────────────────
// Overrides Defaults
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Configuration for file overrides (customized and ignored files).
 */
export const overridesDefaultConfig: OverridesConfig = {
  /** Files customized in fork; prefer fork version during merge conflicts */
  customized: [],
  /** Files and directories to be fully ignored during sync */
  ignored: [],
};
