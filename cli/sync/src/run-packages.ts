import * as path from 'path';

import { config } from './config';
import { logPackageSummaryLines, packageSummaryLines } from './log/package-summary';
import { getDepsToUpdate } from './modules/package/get-deps-to-update';
import { FileAnalysis, PackageJson } from './types';
import { readJsonFile, writeJsonFile } from './utils/files';
import { gitAddAll, gitCheckout, gitCommit, gitPush } from './utils/git/command';
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

  const allSummaryLines = await progress.wrap(async () => {
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

    // Accumulates all log lines to output after processing
    const summaryLines: string[] = [];

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

      // Determine which deps should be updated (dependencies + devDependencies)
      const depsToUpdate = getDepsToUpdate(
        upstreamPackageJson?.dependencies || {},
        forkPackageJson?.dependencies || {},
      );

      const devDepsToUpdate = getDepsToUpdate(
        upstreamPackageJson?.devDependencies || {},
        forkPackageJson?.devDependencies || {},
      );

      // Prepare summary lines for final logging
      const pkgLines = packageSummaryLines(analyzedFile, forkPackageJson, depsToUpdate, devDepsToUpdate);

      summaryLines.push(...pkgLines);

      // If there are any updates, prepare updated package.json content
      const amountOfDepsToUpdate = Object.keys(depsToUpdate).length;
      const amountOfDevDepsToUpdate = Object.keys(devDepsToUpdate).length;

      if (amountOfDepsToUpdate || amountOfDevDepsToUpdate) {
        // Initialize entry if this file hasn't been added yet
        if (!newPackageJsons[resolvedForkPath]) {
          newPackageJsons[resolvedForkPath] = { ...forkPackageJson };
        }

        // Apply dependency updates
        for (const dep in depsToUpdate) {
          newPackageJsons[resolvedForkPath].dependencies = newPackageJsons[resolvedForkPath].dependencies || {};
          newPackageJsons[resolvedForkPath].dependencies![dep] = depsToUpdate[dep];
        }

        // Apply devDependency updates
        for (const dep in devDepsToUpdate) {
          newPackageJsons[resolvedForkPath].devDependencies = newPackageJsons[resolvedForkPath].devDependencies || {};
          newPackageJsons[resolvedForkPath].devDependencies![dep] = devDepsToUpdate[dep];
        }
      }
    }

    // Persist new package.json files, unless in dry-run mode
    if (config.behavior.packageJsonMode === 'dryRun') {
      progress.done('dry run - no changes written');
    } else {
      progress.step('writing package.json updates');

      // Write all updated package.json files
      for (const resolvedForkPath in newPackageJsons) {
        const newPackageJson = newPackageJsons[resolvedForkPath];
        writeJsonFile(resolvedForkPath, newPackageJson);
      }

      progress.step('committing changes');

      // Stage all changes
      await gitAddAll(config.fork.workingDirectory);

      // Commit the updated package.json files
      await gitCommit(
        config.fork.workingDirectory,
        `Sync package.json dependencies from ${config.upstream.branchRef}`,
        { noVerify: true },
      );

      // Push changes if configured to do so
      if (!config.behavior.skipAllPushes) {
        progress.step('pushing changes');
        await gitPush(config.fork.workingDirectory, 'origin', config.fork.branchRef);
      }

      progress.done('packages synced');
    }

    return summaryLines;
  });

  // Log all package summaries
  logPackageSummaryLines(allSummaryLines);
}
