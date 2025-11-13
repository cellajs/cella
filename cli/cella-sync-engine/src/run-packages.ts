import pc from "picocolors";

import { config } from "./config";
import { FileAnalysis } from "./types";
import { readJsonFile, resolvePath } from "./utils/files";
import { gitCheckout } from "./utils/git/command";
import { getRemoteJsonFile } from "./utils/git/helpers";
import { getDepsToUpdate } from "./modules/package/get-deps-to-update";

interface PackageJson {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  [key: string]: any; // optional, allows other fields
}

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

    console.log(pc.bold(`\n${analyzedFile.filePath}:`));
    if (!amountOfDepsToUpdate && !amountOfDevDepsToUpdate) {
      console.log(pc.gray('  - No dependencies to update.'));
      continue;
    }
    console.log('Dependencies:');
    if (!amountOfDepsToUpdate) {
      console.log(pc.gray('  - No dependencies to update.'));
    } else {
      for (const dep in depsToUpdate) {
        console.log(`  - ${dep}: ${forkPackageJson?.dependencies?.[dep]} → ${pc.bold(pc.cyan(depsToUpdate[dep]))}`);
      }
    }
    if (!amountOfDevDepsToUpdate) {
      console.log(pc.gray('  - No dev dependencies to update.'));
    } else {
      console.log('Dev Dependencies:');
      for (const dep in devDepsToUpdate) {
        console.log(`  - ${dep}: ${forkPackageJson?.devDependencies?.[dep]} → ${pc.bold(pc.cyan(devDepsToUpdate[dep]))}`);
      }
    }
  }

  console.info(pc.green("✔ Sync Package.json complete.\n"));
}