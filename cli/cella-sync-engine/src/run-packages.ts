import pc from "picocolors";

import { config } from "./config";
import { FileAnalysis, PackageJson } from "./types";
import { readJsonFile, resolvePath, writeJsonFile } from "./utils/files";
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

  for (const analyzedFile of analyzedFiles) {
    const isPackageFile = analyzedFile.filePath.endsWith('package.json');
    const isRemovedInSwizzle = analyzedFile.swizzle?.flaggedInSettingsAs === 'removed';
    const boilerplatePath = analyzedFile.boilerplateFile?.path;
    const forkPath = analyzedFile.forkFile?.path;

    if (!isPackageFile || isRemovedInSwizzle || !boilerplatePath || !forkPath) {
      continue;
    }

    const resolvedForkPath = resolvePath(forkPath);
    const forkPackageJson = readJsonFile<PackageJson>(resolvedForkPath);
    const boilerplatePackageJson = await getRemoteJsonFile(
      config.boilerplate.workingDirectory,
      config.boilerplate.branchRef,
      analyzedFile.filePath
    );

    const depsToUpdate = getDepsToUpdate(boilerplatePackageJson?.dependencies || {}, forkPackageJson?.dependencies || {});
    const devDepsToUpdate = getDepsToUpdate(boilerplatePackageJson?.devDependencies || {}, forkPackageJson?.devDependencies || {});

    const amountOfDepsToUpdate = Object.keys(depsToUpdate).length;
    const amountOfDevDepsToUpdate = Object.keys(devDepsToUpdate).length;

    // Prepare new package.json content (only if there are updates)
    if (amountOfDepsToUpdate || amountOfDevDepsToUpdate) {
      if (!newPackageJsons[forkPath]) {
        newPackageJsons[forkPath] = { ...forkPackageJson };
      }
      for (const dep in depsToUpdate) {
        newPackageJsons[forkPath].dependencies = newPackageJsons[forkPath].dependencies || {};
        newPackageJsons[forkPath].dependencies![dep] = depsToUpdate[dep];
      }
      for (const dep in devDepsToUpdate) {
        newPackageJsons[forkPath].devDependencies = newPackageJsons[forkPath].devDependencies || {};
        newPackageJsons[forkPath].devDependencies![dep] = devDepsToUpdate[dep];
      }
    }

    // Log the package summary
    const summaryLines = packageSummaryLines(
      analyzedFile,
      forkPackageJson,
      depsToUpdate,
      devDepsToUpdate
    );

    logPackageSummaryLines(summaryLines);
  }

  if (config.behavior.dryRunPackageJsonChanges) {
    console.info(pc.yellow("\nDry Run enabled - no package.json changes will be written.\n"));
  } else {
    // Write new package.json files
    for (const filePath in newPackageJsons) {
      const resolvedForkPath = resolvePath(filePath);
      const newPackageJson = newPackageJsons[filePath];
      writeJsonFile(resolvedForkPath, newPackageJson);
    }

    // // Let Git add all changes
    // await gitAddAll(config.fork.workingDirectory);

    // // Commit package.json changes
    // await gitCommit(config.fork.workingDirectory, `Sync package.json dependencies from ${config.boilerplate.branchRef}`, { noVerify: true });

    // Push changes if not skipped
    if (!config.behavior.skipAllPushes) {
      await gitPush(config.fork.workingDirectory, 'origin', config.fork.branchRef);
    }
  }

  console.info(pc.green("✔ Sync Package.json complete.\n"));
}