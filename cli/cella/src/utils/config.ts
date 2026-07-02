/**
 * Config loading utilities for sync CLI.
 *
 * Shared between main entry point and forks service.
 */

import { existsSync, realpathSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { z } from 'zod';
import { type CellaCliConfig, cellaConfigSchema, type SyncSettings } from '../config/types';
import { resolveAppModuleFolders } from './module-territory';

/** Default git remote name used to point at the upstream repository. */
export const DEFAULT_UPSTREAM_REMOTE = 'cella-upstream';

/** Default branch used when a config omits `upstreamBranch`; also cella's fork-compare base. */
export const DEFAULT_BRANCH = 'main';

/**
 * Default branch a fork receives upstream syncs on via the **forks** (maintainer→fork)
 * service. This is a real, checked-out branch in the fork clone the maintainer pushes onto —
 * distinct from the ephemeral `cella/sync/*` branches the fork owner's own `cella sync` cuts.
 */
export const DEFAULT_SYNC_BRANCH = 'cella-sync';

/**
 * Default prefix for the ephemeral integration branches that `cella sync` cuts per run
 * (e.g. `cella/sync/20260702-1430-c5a1970`).
 *
 * The three-segment shape (`cella/sync/<stamp>`) means it can never collide with a real branch
 * named `cella` or `cella/sync`, and there is no long-lived `cella-sync` branch to conflict with
 * git's ref namespacing (`refs/heads/cella-sync` file vs `refs/heads/cella-sync/` dir).
 */
const DEFAULT_SYNC_PREFIX = 'cella/sync';

/**
 * Default trunk branch that `cella sync` cuts from and opens PRs into.
 */
export const DEFAULT_RELEASE_BASE = 'main';

/**
 * Resolve the branch a fork must be on to receive upstream syncs via the forks service.
 *
 * The fork's own `cella.config.ts` (`settings.syncBranch`) is the source of truth.
 */
export function resolveSyncBranch(settings: SyncSettings): string {
  return settings.syncBranch ?? DEFAULT_SYNC_BRANCH;
}

/**
 * Resolve the prefix for the ephemeral sync branches cut by `cella sync`.
 *
 * The fork's own `cella.config.ts` (`settings.syncBranchPrefix`) is the source of truth.
 */
function resolveSyncPrefix(settings: SyncSettings): string {
  return settings.syncBranchPrefix ?? DEFAULT_SYNC_PREFIX;
}

/**
 * Whether `branch` is one of the ephemeral integration branches `cella sync` cuts, i.e. it
 * lives under the `<syncBranchPrefix>/` namespace (default `cella/sync/`).
 */
export function isEphemeralSyncBranch(settings: SyncSettings, branch: string): boolean {
  return branch.startsWith(`${resolveSyncPrefix(settings)}/`);
}

/**
 * Resolve the trunk branch `cella sync` cuts the ephemeral branch from and PRs into.
 */
export function resolveReleaseBase(settings: SyncSettings): string {
  return settings.releaseBase ?? DEFAULT_RELEASE_BASE;
}

/**
 * Build a unique ephemeral integration branch name for a sync cycle, e.g.
 * `cella/sync/20260702-1430-c5a1970`. Cutting a fresh branch per cycle keeps each PR
 * scoped to that sync's upstream delta.
 */
export function buildEphemeralSyncBranch(settings: SyncSettings, shortSha: string): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
  return `${resolveSyncPrefix(settings)}/${stamp}-${shortSha}`;
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
