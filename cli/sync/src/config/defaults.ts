import { resolve } from 'node:path';
import { MinimalBehaviorConfig, MinimalLogConfig, MinimalOverridesConfig, MinimalRepoConfig } from './types';

/** Resolve to monorepo root (cli/sync is 2 levels deep) */
const monorepoRoot = resolve(import.meta.dirname, '../../../..');

// ─────────────────────────────────────────────────────────────────────────────
// Fork Repository Defaults
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Default configuration for the fork repository.
 * The fork repository contains the user's fork of the upstream repository.
 */
export const forkDefaultConfig: MinimalRepoConfig = {
  /** Local file system path to the fork repository */
  localPath: monorepoRoot,
  /** The remote URL of the fork repository */
  remoteUrl: '',
  /** Your fork's main branch where final changes land */
  branch: 'development',
  /**
   * Intermediate branch for sync operations (local-only, not pushed to remote).
   * Upstream changes are first merged here, conflicts resolved, then squash-merged
   * into your main branch. This keeps your main branch history clean.
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
export const upstreamDefaultConfig: MinimalRepoConfig = {
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
// Behavior Defaults
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Configuration for specifying behavior during sync operations.
 */
export const behaviorDefaultConfig: MinimalBehaviorConfig = {
  /** Root keys in package.json to sync from upstream */
  packageJsonSync: ['dependencies', 'devDependencies'],
  /** Do not write any swizzle metadata file */
  skipWritingSwizzleMetadataFile: true,
  /** Maximum number of git previews for squash commits */
  maxGitPreviewsForSquashCommits: 30,
};

/**
 * Internal behavior constants (not user-configurable).
 */
export const internalBehavior = {
  /** Behavior when remote URL doesn't match: overwrite it */
  onRemoteWrongUrl: 'overwrite' as const,
  /** Behavior when remote is missing: skip operations that need it */
  onMissingRemote: 'skip' as const,
};

// ─────────────────────────────────────────────────────────────────────────────
// Log Defaults
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Configuration for logging within the Cella sync CLI.
 * Shows files that need attention: diverged, behind, or unknown merge strategy.
 */
export const logDefaultConfig: MinimalLogConfig = {
  /** Modules to be logged */
  modules: ['analyzedFile', 'analyzedSummary', 'packageSummary'],
  /**
   * Filters for logging analyzed files.
   * Show diverged files and files with unknown merge strategy.
   */
  analyzedFile: {
    commitSummaryState: ['diverged', 'behind'],
    mergeStrategyStrategy: ['unknown'],
  },
  /** Filters for logging analyzed swizzles */
  analyzedSwizzle: {
    swizzled: true,
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Overrides Defaults
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Configuration related to overrides metadata and settings files.
 */
export const overridesDefaultConfig: MinimalOverridesConfig = {
  /** Local file system path (directory) to find metadata in */
  localDir: process.cwd(),
  /** Version of the overrides metadata format (update when schema changes) */
  metadataVersion: '1.0.0',
  /**
   * Default metadata file name.
   * Stores information about auto-detected overridden files.
   */
  metadataFileName: 'cella.swizzled.json',
  /** Files customized in fork; prefer fork version during merge conflicts */
  customized: [],
  /** Files and directories to be fully ignored during sync */
  ignored: [],
};
