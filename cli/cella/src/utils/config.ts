/**
 * Config loading utilities for sync CLI.
 *
 * Shared between main entry point and forks service.
 */

import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { z } from 'zod';
import { type CellaCliConfig, cellaConfigSchema, type SyncSettings } from '../config/types';
import { resolveAppModuleFolders } from './module-territory';

/** Default git remote name used to point at the upstream repository. */
export const DEFAULT_UPSTREAM_REMOTE = 'cella-upstream';

/** Default branch used when a config omits `upstreamBranch`; also cella's fork-compare base. */
export const DEFAULT_BRANCH = 'main';

/**
 * Default branch a fork receives upstream syncs on.
 *
 * Under release-please, a fork's `main` is squash-merge-only with linear history, so a
 * sync merge cannot be committed onto it directly. The sync lands on this dedicated
 * long-lived integration branch, from which you open a PR into `main`.
 */
export const DEFAULT_SYNC_BRANCH = 'cella-sync';

/**
 * Default trunk branch that `cella release` cuts from and opens PRs into.
 */
export const DEFAULT_RELEASE_BASE = 'main';

/**
 * Resolve the branch a fork must be on to receive upstream syncs.
 *
 * The fork's own `cella.config.ts` (`settings.syncBranch`) is the source of truth.
 */
export function resolveSyncBranch(settings: SyncSettings): string {
  return settings.syncBranch ?? DEFAULT_SYNC_BRANCH;
}

/**
 * Whether a branch counts as a sync branch: either the exact sync branch or an
 * ephemeral child of it (`<syncBranch>/<...>`, as created by `cella release`).
 */
export function isSyncBranch(branch: string, settings: SyncSettings): boolean {
  const syncBranch = resolveSyncBranch(settings);
  return branch === syncBranch || branch.startsWith(`${syncBranch}/`);
}

/**
 * Resolve the trunk branch `cella release` cuts the ephemeral branch from and PRs into.
 */
export function resolveReleaseBase(settings: SyncSettings): string {
  return settings.releaseBase ?? DEFAULT_RELEASE_BASE;
}

/**
 * Build a unique ephemeral integration branch name for a release cycle, e.g.
 * `cella-sync/20260702-1430-c5a1970`. Cutting a fresh branch per cycle keeps each PR
 * scoped to that sync's upstream delta.
 */
export function buildEphemeralSyncBranch(settings: SyncSettings, shortSha: string): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
  return `${resolveSyncBranch(settings)}/${stamp}-${shortSha}`;
}

/**
 * Resolve the upstream tracking plan from sync settings.
 *
 * Single source of truth shared by the CLI entry point and the merge engine.
 * The concrete ref for release tracking (latest tag) can only be resolved after
 * fetching, so this returns a plan; the merge engine turns it into a ref.
 *
 * - `track`: 'release' (default) syncs to the latest release tag; 'branch' follows the tip.
 * - `branchRef`: `<DEFAULT_UPSTREAM_REMOTE>/<branch>` — the branch-track ref and static fallback.
 */
export function resolveUpstream(settings: SyncSettings): {
  track: 'release' | 'branch';
  branchRef: string;
} {
  const track = settings.upstreamTrack ?? 'release';
  const branch = settings.upstreamBranch ?? DEFAULT_BRANCH;
  const branchRef = `${DEFAULT_UPSTREAM_REMOTE}/${branch}`;
  return { track, branchRef };
}

/**
 * Whether the given path is the cella template itself (not a fork).
 *
 * The template's root `package.json` is named `cella`; any fork renames it. Used to hide
 * upstream-facing services (analyze/sync/release) from the menu when running inside cella,
 * where they are meaningless. Direct subcommands still work for testing.
 */
export function isCellaTemplate(forkPath: string): boolean {
  try {
    const pkg = JSON.parse(readFileSync(join(forkPath, 'package.json'), 'utf-8')) as { name?: string };
    return pkg.name === 'cella';
  } catch {
    return false;
  }
}

/**
 * Load cella.config.ts from a fork/repo path.
 */
export async function loadConfig(forkPath: string): Promise<CellaCliConfig> {
  const configPath = join(forkPath, 'cella.config.ts');

  if (!existsSync(configPath)) {
    throw new Error(`config file not found: ${configPath}`);
  }

  // Resolve symlinks and validate path stays within fork directory
  const realConfigPath = realpathSync(configPath);
  const realForkPath = realpathSync(resolve(forkPath));
  if (!realConfigPath.startsWith(`${realForkPath}/`)) {
    throw new Error('config path resolves outside fork directory');
  }

  let configModule: { default?: unknown };
  try {
    configModule = await import(realConfigPath);
  } catch (error) {
    // Syntax/runtime errors while evaluating the config must fail closed: a config that
    // cannot be loaded means sync protections (ignored/pinned) are unknown.
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`failed to load ${configPath}: ${message}`);
  }

  // Strict schema validation.
  const result = cellaConfigSchema.safeParse(configModule.default);
  if (!result.success) {
    throw new Error(`invalid ${configPath}:\n${z.prettifyError(result.error)}`);
  }
  const config: CellaCliConfig = result.data;

  // Auto-derive fork-owned module folders (modules declaring `owner: 'app'`) and merge
  // them into ignored. This keeps app modules as fork territory: upstream never
  // adds/modifies/deletes them during sync, and the contributions service never offers
  // them back upstream. Derived entries always exist (they come from real files), so
  // config validation never warns about them.
  const appModuleFolders = resolveAppModuleFolders(realForkPath);
  if (appModuleFolders.length > 0) {
    const existing = config.overrides?.ignored ?? [];
    config.overrides = {
      ...config.overrides,
      ignored: [...new Set([...existing, ...appModuleFolders])],
    };
  }

  return config;
}
