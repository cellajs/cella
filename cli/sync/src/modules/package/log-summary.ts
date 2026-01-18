/**
 * Package sync logging utilities.
 */
import pc from 'picocolors';
import type { KeyUpdateSummary } from './get-values-to-update';

/** Aggregate stats for package sync summary. */
export interface PackageSyncStats {
  totalPackages: number;
  syncedPackages: number;
  updatedPackages: number;
  updatesByKey: Record<string, number>;
}

/** Creates an empty stats object. */
export function createPackageSyncStats(): PackageSyncStats {
  return {
    totalPackages: 0,
    syncedPackages: 0,
    updatedPackages: 0,
    updatesByKey: {},
  };
}

/** Accumulates stats from a single package's key updates. */
export function accumulatePackageStats(stats: PackageSyncStats, keyUpdates: KeyUpdateSummary[]): void {
  stats.totalPackages++;

  if (keyUpdates.length === 0) {
    stats.syncedPackages++;
  } else {
    stats.updatedPackages++;

    for (const update of keyUpdates) {
      stats.updatesByKey[update.key] = (stats.updatesByKey[update.key] || 0) + update.updateCount;
    }
  }
}

/**
 * Generates a compact one-line summary for package sync.
 * Format: ✓ 9 package.json synced │ ↑3 updated │ 5 deps  2 devDeps
 */
export function packageSummaryLine(stats: PackageSyncStats): string {
  const updatedBadge = pc.cyan(`↑${stats.updatedPackages} updated`);

  const keyBadges: string[] = [];
  for (const [key, count] of Object.entries(stats.updatesByKey)) {
    if (count > 0) {
      const shortKey = key.replace('dependencies', 'deps').replace('devDeps', 'devDeps');
      keyBadges.push(pc.cyan(count) + ' ' + shortKey);
    }
  }

  const parts = [`${pc.green('✓')} ${stats.totalPackages} package.json synced`];
  if (stats.updatedPackages > 0) parts.push(updatedBadge);
  if (keyBadges.length > 0) parts.push(keyBadges.join('  '));

  return parts.join(' │ ');
}

/** Logs the package summary lines to the console. */
export function logPackageSummaryLines(lines: string[]): void {
  // Summary is always shown (it's compact and useful)
  for (const line of lines) {
    console.info(line);
  }
}
