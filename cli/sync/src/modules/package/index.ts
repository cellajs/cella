/**
 * Package module - Synchronizes package.json dependencies between upstream and fork.
 */
import * as path from 'path';
import { config } from '#/config';
import type { FileAnalysis, PackageJson } from '#/types';
import { readJsonFile, writeJsonFile } from '#/utils/files';
import { gitAddAll, gitCheckout } from '#/utils/git/command';
import { getRemoteJsonFile } from '#/utils/git/helpers';
import { createProgress } from '#/utils/progress';
import { applyPackageUpdates, getPackageUpdates } from './get-values-to-update';
import {
  accumulatePackageStats,
  createPackageSyncStats,
  logPackageSummaryLines,
  packageSummaryLine,
} from './log-summary';

export type { KeyUpdateSummary } from './get-values-to-update';
// Re-export utilities
export { applyPackageUpdates, getPackageUpdates } from './get-values-to-update';
export type { PackageSyncStats } from './log-summary';
export {
  accumulatePackageStats,
  createPackageSyncStats,
  logPackageSummaryLines,
  packageSummaryLine,
} from './log-summary';

/**
 * Synchronizes package dependencies between the upstream repository and the fork.
 *
 * Processes package.json files from analyzed files that:
 * - exist in both upstream and fork
 * - are not ignored via overrides configuration
 *
 * @param analyzedFiles - The results from runAnalyze()
 */
export async function runPackages(analyzedFiles: FileAnalysis[]) {
  const progress = createProgress('syncing packages');

  const summaryLine = await progress.wrap(async () => {
    progress.step('checking out target branch');

    await gitCheckout(config.workingDirectory, config.forkBranchRef);

    const newPackageJsons: { [filePath: string]: PackageJson } = {};
    const stats = createPackageSyncStats();

    progress.step('analyzing package.json files');

    for (const analyzedFile of analyzedFiles) {
      const isPackageFile = analyzedFile.filePath.endsWith('package.json');
      const isIgnored = analyzedFile.overrideStatus === 'ignored';
      const upstreamPath = analyzedFile.upstreamFile?.path;
      const forkPath = analyzedFile.forkFile?.path;

      if (!isPackageFile || isIgnored || !upstreamPath || !forkPath) continue;

      const resolvedForkPath = path.join(config.workingDirectory, forkPath);
      const forkPackageJson = readJsonFile<PackageJson>(resolvedForkPath);

      const upstreamPackageJson = await getRemoteJsonFile(
        config.workingDirectory,
        config.upstreamBranchRef,
        analyzedFile.filePath,
      );

      const keysToSync = config.packageJsonSync;
      const keyUpdates = getPackageUpdates(upstreamPackageJson || {}, forkPackageJson || {}, keysToSync);

      accumulatePackageStats(stats, keyUpdates);

      if (keyUpdates.length > 0) {
        if (!newPackageJsons[resolvedForkPath]) {
          newPackageJsons[resolvedForkPath] = { ...forkPackageJson };
        }
        applyPackageUpdates(newPackageJsons[resolvedForkPath], keyUpdates);
      }
    }

    progress.step('writing package.json updates');

    for (const resolvedForkPath in newPackageJsons) {
      const newPackageJson = newPackageJsons[resolvedForkPath];
      writeJsonFile(resolvedForkPath, newPackageJson);
    }

    await gitAddAll(config.workingDirectory);

    progress.done('');

    return packageSummaryLine(stats);
  });

  logPackageSummaryLines([summaryLine]);
}
