import pc from "picocolors";
import * as path from 'path';

import { config } from "./config";
import { FileAnalysis, PackageJson } from "./types";
import { readJsonFile, writeJsonFile } from "./utils/files";
import { gitAddAll, gitCheckout, gitCommit, gitPush } from "./utils/git/command";
import { getRemoteJsonFile } from "./utils/git/helpers";
import { getDepsToUpdate } from "./modules/package/get-deps-to-update";
import { logPackageSummaryLines, packageSummaryLines } from "./log/package-summary";
import { checkMark } from "./utils/console";

/**
 * Synchronizes package dependencies between the boilerplate repository and the fork.
 *
 * This process only affects files discovered during `runAnalyze()` that:
 * - are `package.json`
 * - exist in both boilerplate and fork
 * - are *not* removed via swizzle configuration
 *
 * For each eligible package.json:
 * - dependencies/devDependencies are compared against the boilerplate's
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
  console.info(pc.cyan("\nRunning Sync Package.json"));

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
  const allSummaryLines: string[] = [];

  // Iterate all analyzed files and process package.json entries
  for (const analyzedFile of analyzedFiles) {
    const isPackageFile = analyzedFile.filePath.endsWith('package.json');
    const isRemovedInSwizzle = analyzedFile.swizzle?.flaggedInSettingsAs === 'removed';
    const boilerplatePath = analyzedFile.boilerplateFile?.path;
    const forkPath = analyzedFile.forkFile?.path;

    // Skip irrelevant or non-existent files
    if (!isPackageFile || isRemovedInSwizzle || !boilerplatePath || !forkPath) {
      continue;
    }

    // Load package.json files from both boilerplate and fork
    const resolvedForkPath = path.join(config.fork.workingDirectory, forkPath);
    const forkPackageJson = readJsonFile<PackageJson>(resolvedForkPath);

    const boilerplatePackageJson = await getRemoteJsonFile(
      config.boilerplate.workingDirectory,
      config.boilerplate.branchRef,
      analyzedFile.filePath
    );

    // Determine which deps should be updated (dependencies + devDependencies)
    const depsToUpdate = getDepsToUpdate(
      boilerplatePackageJson?.dependencies || {},
      forkPackageJson?.dependencies || {}
    );

    const devDepsToUpdate = getDepsToUpdate(
      boilerplatePackageJson?.devDependencies || {},
      forkPackageJson?.devDependencies || {}
    );

    // Prepare summary lines for final logging
    const summaryLines = packageSummaryLines(
      analyzedFile,
      forkPackageJson,
      depsToUpdate,
      devDepsToUpdate
    );

    allSummaryLines.push(...summaryLines);

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
    console.info(pc.yellow("\nDry Run enabled - no package.json changes will be written.\n"));
  } else {
    // Write all updated package.json files
    for (const resolvedForkPath in newPackageJsons) {
      const newPackageJson = newPackageJsons[resolvedForkPath];
      writeJsonFile(resolvedForkPath, newPackageJson);
    }

    // Stage all changes
    await gitAddAll(config.fork.workingDirectory);

    // Commit the updated package.json files
    await gitCommit(config.fork.workingDirectory, `Sync package.json dependencies from ${config.boilerplate.branchRef}`, { noVerify: true });

    // Push changes if configured to do so
    if (!config.behavior.skipAllPushes) {
      await gitPush(config.fork.workingDirectory, 'origin', config.fork.branchRef);
    }
  }

  console.info(`${checkMark} ${pc.green("Sync Package.json complete.\n")}`);

  // Log all package summaries
  logPackageSummaryLines(allSummaryLines);
}