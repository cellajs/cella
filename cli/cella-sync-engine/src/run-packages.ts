import pc from "picocolors";
import * as path from 'path';

import { config } from "./config";
import { FileAnalysis, PackageJson } from "./types";
import { readJsonFile, writeJsonFile } from "./utils/files";
import { gitAddAll, gitCheckout, gitCommit, gitPush } from "./utils/git/command";
import { getRemoteJsonFile } from "./utils/git/helpers";
import { getDepsToUpdate } from "./modules/package/get-deps-to-update";
import { logPackageSummaryLines, packageSummaryLines } from "./log/package-summary";

/**
 * Sync package dependencies between boilerplate and fork.
 * - Will only update packages that are defined in both repositories.
 * - Ensures that package versions in the fork match those in the boilerplate.
 * - Only updates (fork) dependencies in package.json who are not set as exact versions.
 *
 * @example
 * await runPackages();
 */
export async function runPackages(analyzedFiles: FileAnalysis[]) {
  console.info(pc.cyan("\nRunning Sync Package.json"));

  // Checkout to the branch to merge into
  await gitCheckout(config.fork.workingDirectory, config.fork.branchRef);

  // Keep track of new package.jsons to write
  const newPackageJsons: { [filePath: string]: PackageJson } = {};

  // Gather all lines to log
  const allSummaryLines: string[] = [];

  // Use file analyses to determine which package.json files to update
  for (const analyzedFile of analyzedFiles) {
    // Create some pointer flags for easier reading
    const isPackageFile = analyzedFile.filePath.endsWith('package.json');
    const isRemovedInSwizzle = analyzedFile.swizzle?.flaggedInSettingsAs === 'removed';
    const boilerplatePath = analyzedFile.boilerplateFile?.path;
    const forkPath = analyzedFile.forkFile?.path;

    // Skip non-package.json files, removed files, or files not present in both repos
    if (!isPackageFile || isRemovedInSwizzle || !boilerplatePath || !forkPath) {
      continue;
    }

    // Load package.json files
    const resolvedForkPath = path.join(config.fork.workingDirectory, forkPath);
    const forkPackageJson = readJsonFile<PackageJson>(resolvedForkPath);
    const boilerplatePackageJson = await getRemoteJsonFile(
      config.boilerplate.workingDirectory,
      config.boilerplate.branchRef,
      analyzedFile.filePath
    );

    // Determine dependencies to update
    const depsToUpdate = getDepsToUpdate(boilerplatePackageJson?.dependencies || {}, forkPackageJson?.dependencies || {});
    const devDepsToUpdate = getDepsToUpdate(boilerplatePackageJson?.devDependencies || {}, forkPackageJson?.devDependencies || {});

    // Create summary lines (will be logged at the end of the process)
    const summaryLines = packageSummaryLines(
      analyzedFile,
      forkPackageJson,
      depsToUpdate,
      devDepsToUpdate
    );

    // Append to all summary lines
    allSummaryLines.push(...summaryLines);

    // Determine amounts of dependencies to update
    const amountOfDepsToUpdate = Object.keys(depsToUpdate).length;
    const amountOfDevDepsToUpdate = Object.keys(devDepsToUpdate).length;

    // Prepare new package.json content (only if there are updates)
    if (amountOfDepsToUpdate || amountOfDevDepsToUpdate) {
      if (!newPackageJsons[resolvedForkPath]) {
        newPackageJsons[resolvedForkPath] = { ...forkPackageJson };
      }

      for (const dep in depsToUpdate) {
        newPackageJsons[resolvedForkPath].dependencies = newPackageJsons[resolvedForkPath].dependencies || {};
        newPackageJsons[resolvedForkPath].dependencies![dep] = depsToUpdate[dep];
      }
      
      for (const dep in devDepsToUpdate) {
        newPackageJsons[resolvedForkPath].devDependencies = newPackageJsons[resolvedForkPath].devDependencies || {};
        newPackageJsons[resolvedForkPath].devDependencies![dep] = devDepsToUpdate[dep];
      }
    }
  }

  // Handle dry run or write changes
  if (config.behavior.packageJsonMode === 'dryRun') {
    console.info(pc.yellow("\nDry Run enabled - no package.json changes will be written.\n"));
  } else {
    // Write new package.json files
    for (const resolvedForkPath in newPackageJsons) {
      const newPackageJson = newPackageJsons[resolvedForkPath];
      writeJsonFile(resolvedForkPath, newPackageJson);
    }

    // Let Git add all changes
    await gitAddAll(config.fork.workingDirectory);

    // Commit package.json changes
    await gitCommit(config.fork.workingDirectory, `Sync package.json dependencies from ${config.boilerplate.branchRef}`, { noVerify: true });

    // Push changes if not skipped
    if (!config.behavior.skipAllPushes) {
      await gitPush(config.fork.workingDirectory, 'origin', config.fork.branchRef);
    }
  }

  console.info(pc.green("✔ Sync Package.json complete.\n"));

  // Log all package summaries
  logPackageSummaryLines(allSummaryLines);
}