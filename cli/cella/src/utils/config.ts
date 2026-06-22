/**
 * Config loading utilities for sync CLI.
 *
 * Shared between main entry point and forks service.
 */

import { existsSync, realpathSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { CellaCliConfig, SyncSettings } from '../config/types';
import { resolveAppModuleFolders } from './module-territory';

/** Default git remote name used to point at the upstream repository. */
export const DEFAULT_UPSTREAM_REMOTE = 'cella-upstream';

/**
 * Resolve the upstream comparison target from sync settings.
 *
 * Single source of truth shared by the CLI entry point and the merge engine so
 * the pinned-vs-tip rule and remote-name default are not duplicated.
 *
 * - `remoteName`: the local git remote pointing at `upstreamUrl` (defaulted).
 * - `pinnedSha`: present only when the config pins upstream to an exact commit.
 * - `upstreamRef`: the ref used for diffing. When pinned, this is the exact SHA
 *   (security: only a reviewed commit is compared/merged). Otherwise it tracks
 *   the branch tip `<remoteName>/<upstreamBranch>`.
 */
export function resolveUpstream(settings: SyncSettings): {
  remoteName: string;
  pinnedSha?: string;
  upstreamRef: string;
} {
  const remoteName = settings.upstreamRemoteName || DEFAULT_UPSTREAM_REMOTE;
  const pinnedSha = settings.upstreamPinnedSha;
  const upstreamRef = pinnedSha ?? `${remoteName}/${settings.upstreamBranch}`;
  return { remoteName, pinnedSha, upstreamRef };
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

  const configModule = await import(realConfigPath);
  const config: CellaCliConfig = configModule.default;

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
