/**
 * Packages service for sync CLI v2.
 *
 * Syncs package.json dependencies between fork and upstream.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import pc from 'picocolors';
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
  [key: string]: unknown;
}

/** Package locations in the monorepo */
const packageLocations = ['', 'frontend', 'backend', 'config', 'cdc'];

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
 * Merge a dependency section from upstream to fork.
 */
function mergeDeps(
  forkDeps: Record<string, string> | undefined,
  upstreamDeps: Record<string, string> | undefined,
): Record<string, string> | undefined {
  if (!upstreamDeps) return forkDeps;
  if (!forkDeps) return { ...upstreamDeps };

  const merged = { ...forkDeps };

  for (const [name, version] of Object.entries(upstreamDeps)) {
    // Add new deps, update existing deps to upstream version
    merged[name] = version;
  }

  // Sort alphabetically
  return Object.fromEntries(Object.entries(merged).sort(([a], [b]) => a.localeCompare(b)));
}

/**
 * Sync a single package.json file.
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
    const forkValue = forkPkg[key];
    const upstreamValue = upstreamPkg[key];

    if (!upstreamValue) continue;

    if (key.includes('ependencies')) {
      // Dependency sections - merge
      const merged = mergeDeps(
        forkValue as Record<string, string> | undefined,
        upstreamValue as Record<string, string>,
      );

      if (JSON.stringify(forkValue) !== JSON.stringify(merged)) {
        (forkPkg as Record<string, unknown>)[key] = merged;
        updated = true;
        changes.push(`${key}: merged`);
      }
    } else if (key === 'scripts') {
      // Scripts - merge (add new, update existing)
      const forkScripts = (forkValue || {}) as Record<string, string>;
      const upstreamScripts = upstreamValue as Record<string, string>;

      for (const [name, script] of Object.entries(upstreamScripts)) {
        if (forkScripts[name] !== script) {
          forkScripts[name] = script;
          updated = true;
          changes.push(`scripts.${name}: updated`);
        }
      }

      forkPkg.scripts = forkScripts;
    } else {
      // Other keys - direct copy
      if (JSON.stringify(forkValue) !== JSON.stringify(upstreamValue)) {
        (forkPkg as Record<string, unknown>)[key] = upstreamValue;
        updated = true;
        changes.push(`${key}: updated`);
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
 * Syncs package.json dependencies from upstream to fork.
 */
export async function runPackages(config: RuntimeConfig): Promise<void> {
  createSpinner('Syncing package.json files...');

  const keysToSync = config.settings.packageJsonSync || ['dependencies', 'devDependencies'];
  const results: { location: string; changes: string[] }[] = [];

  for (const location of packageLocations) {
    spinnerText(`Syncing ${location || 'root'}/package.json...`);

    const { updated, changes } = await syncPackageJson(config.forkPath, config.upstreamRef, location, keysToSync);

    if (updated) {
      results.push({ location: location || 'root', changes });
    }
  }

  spinnerSuccess('Package sync complete');

  // Print results
  if (results.length === 0) {
    console.info(pc.dim('  No package.json changes needed'));
  } else {
    for (const { location, changes } of results) {
      console.info(`  ${pc.green('✓')} ${location}/package.json`);
      for (const change of changes) {
        console.info(`    ${pc.dim('→')} ${change}`);
      }
    }
  }
}
