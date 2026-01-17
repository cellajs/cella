import * as path from 'path';

import { config } from './config';
import {
  accumulatePackageStats,
  createPackageSyncStats,
  logPackageSummaryLines,
  packageSummaryLine,
} from './log/package-summary';
import { applyPackageUpdates, getPackageUpdates } from './modules/package/get-values-to-update';
import { FileAnalysis, PackageJson } from './types';
import { readJsonFile, writeJsonFile } from './utils/files';
import { gitAddAll, gitCheckout } from './utils/git/command';
import { getRemoteJsonFile } from './utils/git/helpers';
import { createProgress } from './utils/progress';

/**
 * Synchronizes package dependencies between the upstream repository and the fork.
 *
 * This process only affects files discovered during `runAnalyze()` that:
 * - are `package.json`
 * - exist in both upstream and fork
 * - are *not* ignored via overrides configuration
 *
 * For each eligible package.json:
 * - dependencies/devDependencies are compared against the upstream's
 * - only non-exact (range-based) fork dependencies are updated
 * - updated package.jsons are either written or skipped (in dry-run mode)
 *
 * After batching updates, this function:
 * - stages all modified package.json files
 * - commits them using a standardized message
 * - optionally pushes the updates depending on configuration
 *
 * Finally, a readable summary of updates is logged.
 *
 * @param analyzedFiles - The results from `runAnalyze()`, used to determine which
 *                      package.json files require synchronization.
 */
export async function runPackages(analyzedFiles: FileAnalysis[]) {
  const progress = createProgress('syncing packages');

  const summaryLine = await progress.wrap(async () => {
    progress.step('checking out target branch');

    // Ensure we operate on the correct target branch in the fork
    await gitCheckout(config.fork.workingDirectory, config.fork.branchRef);

    /**
     * Structures used during sync:
     *
     * newPackageJsons:
     * A lookup table of absolute file paths → updated package.json data.
     * Created lazily only when a file has changes.
     */
    const newPackageJsons: { [filePath: string]: PackageJson } = {};

    // Aggregate stats for summary
    const stats = createPackageSyncStats();

    progress.step('analyzing package.json files');

    // Iterate all analyzed files and process package.json entries
    for (const analyzedFile of analyzedFiles) {
      const isPackageFile = analyzedFile.filePath.endsWith('package.json');
      const isIgnored = analyzedFile.swizzle?.flaggedInSettingsAs === 'ignored';
      const upstreamPath = analyzedFile.upstreamFile?.path;
      const forkPath = analyzedFile.forkFile?.path;

      // Skip irrelevant or non-existent files
      if (!isPackageFile || isIgnored || !upstreamPath || !forkPath) {
        continue;
      }

      // Load package.json files from both upstream and fork
      const resolvedForkPath = path.join(config.fork.workingDirectory, forkPath);
      const forkPackageJson = readJsonFile<PackageJson>(resolvedForkPath);

      const upstreamPackageJson = await getRemoteJsonFile(
        config.upstream.workingDirectory,
        config.upstream.branchRef,
        analyzedFile.filePath,
      );

      // Get configured keys to sync (defaults to dependencies, devDependencies)
      const keysToSync = config.behavior.packageJsonSync || ['dependencies', 'devDependencies'];

      // Determine which keys need updates
      const keyUpdates = getPackageUpdates(upstreamPackageJson || {}, forkPackageJson || {}, keysToSync);

      // Accumulate stats for summary
      accumulatePackageStats(stats, keyUpdates);

      // If there are any updates, prepare updated package.json content
      if (keyUpdates.length > 0) {
        // Initialize entry if this file hasn't been added yet
        if (!newPackageJsons[resolvedForkPath]) {
          newPackageJsons[resolvedForkPath] = { ...forkPackageJson };
        }

        // Apply all key updates
        applyPackageUpdates(newPackageJsons[resolvedForkPath], keyUpdates);
      }
    }

    progress.step('writing package.json updates');

    // Write all updated package.json files
    for (const resolvedForkPath in newPackageJsons) {
      const newPackageJson = newPackageJsons[resolvedForkPath];
      writeJsonFile(resolvedForkPath, newPackageJson);
    }

    // Stage all changes (developer commits manually with file sync changes)
    await gitAddAll(config.fork.workingDirectory);

    progress.done('packages staged');

    return packageSummaryLine(stats);
  });

  // Log compact summary
  logPackageSummaryLines([summaryLine]);
}
