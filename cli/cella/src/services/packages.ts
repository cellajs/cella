/**
 * Packages service for sync CLI v2.
 *
 * Syncs package.json keys between fork and upstream using safe merge logic:
 * - Add-only: new entries from upstream are added
 * - Bump-only: versions are only upgraded, never downgraded
 * - Never remove: fork entries not in upstream are preserved
 * - Supports nested `pnpm` key (overrides, patchedDependencies, packageExtensions)
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import pc from 'picocolors';
import * as semver from 'semver';
import type { PackageJsonSyncKey, RuntimeConfig } from '../config/types';
import { createSpinner, spinnerSuccess, spinnerText } from '../utils/display';

/** Package.json structure */
interface PackageJson {
  name?: string;
  version?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  scripts?: Record<string, string>;
  engines?: Record<string, string>;
  packageManager?: string;
  overrides?: Record<string, string>;
  pnpm?: {
    overrides?: Record<string, string>;
    patchedDependencies?: Record<string, string>;
    packageExtensions?: Record<string, Record<string, unknown>>;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

/**
 * Check if upstream version is higher than fork version.
 * Returns true only if upstream is strictly higher — never downgrades.
 * For non-parseable values (workspace:*, etc.), returns false (keep fork's).
 */
function isHigherVersion(upstreamVersion: string, forkVersion: string): boolean {
  if (upstreamVersion === forkVersion) return false;

  // Extract the version part, stripping range prefixes
  const upCoerced = semver.coerce(upstreamVersion);
  const forkCoerced = semver.coerce(forkVersion);

  if (!upCoerced || !forkCoerced) return false;

  return semver.gt(upCoerced, forkCoerced);
}

/**
 * Safe merge for Record<string, string> — add new entries, bump versions, never remove or downgrade.
 * Returns the merged record sorted alphabetically, or undefined if no changes.
 */
function safeMergeRecord(
  forkRecord: Record<string, string> | undefined,
  upstreamRecord: Record<string, string> | undefined,
): { merged: Record<string, string>; changed: boolean } | undefined {
  if (!upstreamRecord) return undefined;

  const merged = { ...(forkRecord || {}) };
  let changed = false;

  for (const [name, upstreamValue] of Object.entries(upstreamRecord)) {
    const forkValue = merged[name];

    if (forkValue === undefined) {
      // New entry from upstream — add it
      merged[name] = upstreamValue;
      changed = true;
    } else if (forkValue !== upstreamValue && isHigherVersion(upstreamValue, forkValue)) {
      // Upstream has a higher version — bump (preserve upstream's range prefix)
      merged[name] = upstreamValue;
      changed = true;
    }
    // Otherwise: fork has equal or higher version, or non-parseable — keep fork's
  }

  // Sort alphabetically
  const sorted = Object.fromEntries(Object.entries(merged).sort(([a], [b]) => a.localeCompare(b)));
  return { merged: sorted, changed };
}

/**
 * Safe merge for the `pnpm` key — recurse into sub-objects with add/bump-only logic.
 */
function safeMergePnpm(
  forkPnpm: PackageJson['pnpm'],
  upstreamPnpm: PackageJson['pnpm'],
): { merged: PackageJson['pnpm']; changed: boolean } | undefined {
  if (!upstreamPnpm) return undefined;

  const merged: NonNullable<PackageJson['pnpm']> = { ...(forkPnpm || {}) };
  let changed = false;

  // pnpm.overrides — same as dependency overrides: add new, bump versions
  if (upstreamPnpm.overrides) {
    const result = safeMergeRecord(
      merged.overrides as Record<string, string> | undefined,
      upstreamPnpm.overrides as Record<string, string>,
    );
    if (result?.changed) {
      merged.overrides = result.merged;
      changed = true;
    }
  }

  // pnpm.patchedDependencies — add-only (version comparison doesn't apply to patch paths)
  if (upstreamPnpm.patchedDependencies) {
    const forkPatched = (merged.patchedDependencies || {}) as Record<string, string>;
    const upstreamPatched = upstreamPnpm.patchedDependencies as Record<string, string>;

    for (const [name, value] of Object.entries(upstreamPatched)) {
      if (!(name in forkPatched)) {
        forkPatched[name] = value;
        changed = true;
      }
    }

    if (changed || !merged.patchedDependencies) {
      merged.patchedDependencies = Object.fromEntries(
        Object.entries(forkPatched).sort(([a], [b]) => a.localeCompare(b)),
      );
    }
  }

  // pnpm.packageExtensions — add new packages and add new sub-keys, never remove
  if (upstreamPnpm.packageExtensions) {
    const forkExts = (merged.packageExtensions || {}) as Record<string, Record<string, unknown>>;
    const upstreamExts = upstreamPnpm.packageExtensions as Record<string, Record<string, unknown>>;

    for (const [pkg, upstreamExt] of Object.entries(upstreamExts)) {
      if (!(pkg in forkExts)) {
        // New package extension — add entirely
        forkExts[pkg] = upstreamExt;
        changed = true;
      } else {
        // Existing package — add new sub-keys only
        for (const [subKey, subValue] of Object.entries(upstreamExt)) {
          if (!(subKey in forkExts[pkg])) {
            forkExts[pkg][subKey] = subValue;
            changed = true;
          }
        }
      }
    }

    merged.packageExtensions = forkExts;
  }

  // Other pnpm sub-keys — add if missing in fork
  for (const [key, value] of Object.entries(upstreamPnpm)) {
    if (['overrides', 'patchedDependencies', 'packageExtensions'].includes(key)) continue;
    if (!(key in merged)) {
      merged[key] = value;
      changed = true;
    }
  }

  return { merged, changed };
}

/**
 * Read a package.json file.
 */
function readPackageJson(filePath: string): PackageJson | null {
  if (!existsSync(filePath)) return null;
  try {
    return JSON.parse(readFileSync(filePath, 'utf-8'));
  } catch {
    return null;
  }
}

/**
 * Write a package.json file (pretty-printed).
 */
function writePackageJson(filePath: string, data: PackageJson): void {
  writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf-8');
}

/**
 * Get package.json from upstream ref.
 */
async function getUpstreamPackageJson(
  forkPath: string,
  upstreamRef: string,
  relativePath: string,
): Promise<PackageJson | null> {
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const execFileAsync = promisify(execFile);

  const filePath = relativePath ? `${relativePath}/package.json` : 'package.json';

  try {
    const { stdout } = await execFileAsync('git', ['show', `${upstreamRef}:${filePath}`], {
      cwd: forkPath,
    });
    return JSON.parse(stdout);
  } catch {
    return null;
  }
}

/**
 * Discover all package.json locations that exist in both fork and upstream.
 */
async function discoverPackageLocations(forkPath: string, upstreamRef: string): Promise<string[]> {
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const execFileAsync = promisify(execFile);

  // Get all package.json paths from upstream
  let upstreamPaths: string[];
  try {
    const { stdout } = await execFileAsync('git', ['ls-tree', '-r', '--name-only', upstreamRef], {
      cwd: forkPath,
    });
    upstreamPaths = stdout
      .split('\n')
      .filter((p) => p.endsWith('/package.json') || p === 'package.json')
      .map((p) => (p === 'package.json' ? '' : p.replace('/package.json', '')));
  } catch {
    return [];
  }

  // Filter to locations that also exist in fork
  return upstreamPaths.filter((loc) => {
    const forkPkgPath = join(forkPath, loc, 'package.json');
    return existsSync(forkPkgPath);
  });
}

/**
 * Sync a single package.json file with safe merge logic.
 */
async function syncPackageJson(
  forkPath: string,
  upstreamRef: string,
  relativePath: string,
  keysToSync: PackageJsonSyncKey[],
): Promise<{ updated: boolean; changes: string[] }> {
  const changes: string[] = [];
  const pkgPath = join(forkPath, relativePath, 'package.json');

  const forkPkg = readPackageJson(pkgPath);
  const upstreamPkg = await getUpstreamPackageJson(forkPath, upstreamRef, relativePath);

  if (!forkPkg || !upstreamPkg) {
    return { updated: false, changes };
  }

  let updated = false;

  for (const key of keysToSync) {
    if (key === 'pnpm') {
      // Handle nested pnpm key
      const result = safeMergePnpm(forkPkg.pnpm, upstreamPkg.pnpm);
      if (result?.changed) {
        forkPkg.pnpm = result.merged;
        updated = true;
        changes.push('pnpm: merged');
      }
      continue;
    }

    if (key === 'packageManager') {
      // String key — only bump, never downgrade
      const upstreamValue = upstreamPkg[key] as string | undefined;
      const forkValue = forkPkg[key] as string | undefined;

      if (upstreamValue && !forkValue) {
        forkPkg[key] = upstreamValue;
        updated = true;
        changes.push(`${key}: added`);
      } else if (
        upstreamValue &&
        forkValue &&
        upstreamValue !== forkValue &&
        isHigherVersion(upstreamValue, forkValue)
      ) {
        forkPkg[key] = upstreamValue;
        updated = true;
        changes.push(`${key}: bumped`);
      }
      continue;
    }

    // All Record<string, string> keys — safe merge (add + bump only)
    const forkValue = forkPkg[key] as Record<string, string> | undefined;
    const upstreamValue = upstreamPkg[key] as Record<string, string> | undefined;

    if (key === 'scripts') {
      // Scripts: add-only — don't overwrite existing fork scripts
      if (upstreamValue) {
        const forkScripts = { ...(forkValue || {}) };
        let scriptChanged = false;

        for (const [name, script] of Object.entries(upstreamValue)) {
          if (!(name in forkScripts)) {
            forkScripts[name] = script;
            scriptChanged = true;
            changes.push(`scripts.${name}: added`);
          }
        }

        if (scriptChanged) {
          (forkPkg as Record<string, unknown>)[key] = forkScripts;
          updated = true;
        }
      }
    } else {
      // Dependency-like keys — add + bump, never remove or downgrade
      const result = safeMergeRecord(forkValue, upstreamValue);
      if (result?.changed) {
        (forkPkg as Record<string, unknown>)[key] = result.merged;
        updated = true;
        changes.push(`${key}: merged`);
      }
    }
  }

  if (updated) {
    writePackageJson(pkgPath, forkPkg);
  }

  return { updated, changes };
}

/**
 * Run the packages sync service.
 *
 * Dynamically discovers all package.json locations in both fork and upstream,
 * then syncs configured keys using safe merge logic (add-only, bump-only).
 */
export async function runPackages(config: RuntimeConfig): Promise<void> {
  createSpinner('syncing package.json files...');

  const keysToSync = config.settings.packageJsonSync || ['dependencies', 'devDependencies'];

  // Dynamically discover package locations
  const locations = await discoverPackageLocations(config.forkPath, config.upstreamRef);
  const results: { location: string; changes: string[] }[] = [];

  for (const location of locations) {
    spinnerText(`syncing ${location || 'root'}/package.json...`);

    const { updated, changes } = await syncPackageJson(config.forkPath, config.upstreamRef, location, keysToSync);

    if (updated) {
      results.push({ location: location || 'root', changes });
    }
  }

  spinnerSuccess('package sync complete');

  // Print results
  if (results.length === 0) {
    console.info(pc.dim('  no package.json changes needed'));
  } else {
    for (const { location, changes } of results) {
      console.info(`  ${pc.green('✓')} ${location}/package.json`);
      for (const change of changes) {
        console.info(`    ${pc.dim('→')} ${change}`);
      }
    }
  }
}
