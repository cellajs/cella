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

/** Default branch used when a config omits `upstreamBranch` / `workingBranch`. */
export const DEFAULT_BRANCH = 'main';

/**
 * Resolve the upstream tracking plan from sync settings.
 *
 * Single source of truth shared by the CLI entry point and the merge engine.
 * The concrete ref for release tracking (latest/pinned tag) can only be resolved
 * after fetching, so this returns a plan; the merge engine turns it into a ref.
 *
 * - `remoteName`: the local git remote pointing at `upstreamUrl` (defaulted).
 * - `track`: 'release' (default) syncs to a release tag; 'branch' follows the tip.
 * - `branch`: upstream branch (defaulted to 'main'), used for branch tracking + links.
 * - `tag`: an explicit release tag to pin to (release track only).
 * - `branchRef`: `<remoteName>/<branch>` — the branch-track ref and static fallback.
 */
export function resolveUpstream(settings: SyncSettings): {
  remoteName: string;
  track: 'release' | 'branch';
  branch: string;
  tag?: string;
  branchRef: string;
} {
  const remoteName = settings.upstreamRemoteName || DEFAULT_UPSTREAM_REMOTE;
  const track = settings.upstreamTrack ?? 'release';
  const branch = settings.upstreamBranch ?? DEFAULT_BRANCH;
  const tag = settings.upstreamTag;
  const branchRef = `${remoteName}/${branch}`;
  return { remoteName, track, branch, tag, branchRef };
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
