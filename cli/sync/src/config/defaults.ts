import { resolve } from 'node:path';
import type { OverridesConfig, PackageJsonSyncKey } from './types';

/** Resolve to monorepo root (cli/sync is 2 levels deep) */
export const monorepoRoot = resolve(import.meta.dirname, '../../../..');

// ─────────────────────────────────────────────────────────────────────────────
// Default Values
// ─────────────────────────────────────────────────────────────────────────────

// Upstream defaults
export const upstreamUrlDefault = 'https://github.com/cellajs/cella.git';
export const upstreamBranchDefault = 'development';
export const upstreamRemoteNameDefault = 'cella-upstream';

// Fork defaults
export const forkBranchDefault = 'development';

/**
 * Default sync branch name.
 * sync-branch maintains full git ancestry with upstream (local-only, never pushed).
 *
 * It contains actual upstream merge commits (not squashed), enabling:
 * - Accurate "commits behind" detection via shared commit SHAs
 * - Proper three-way merges with conflict detection
 * - Git merge-base calculations to work correctly
 *
 * Flow: upstream → sync-branch (full history) → development (squashed)
 */
export const forkSyncBranchDefault = 'sync-branch';

// Options defaults
export const verboseDefault = false;
export const maxSquashPreviewsDefault = 30;
export const packageJsonSyncDefault: PackageJsonSyncKey[] = ['dependencies', 'devDependencies'];

// ─────────────────────────────────────────────────────────────────────────────
// Overrides Defaults
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Configuration for file overrides (pinned and ignored files).
 */
export const overridesDefaultConfig: OverridesConfig = {
  /** Files pinned to fork; prefer fork version during merge conflicts */
  pinned: [],
  /** Files and directories to be fully ignored during sync */
  ignored: [],
};
