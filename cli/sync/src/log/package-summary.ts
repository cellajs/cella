import pc from 'picocolors';
import { config } from '../config';
import { DIVIDER } from '../constants';
import { FileAnalysis, PackageJson } from '../types';

/**
 * Generates summary lines for a package.json file analysis.
 *
 * @param analyzedFile - The analyzed file information.
 * @param forkPackageJson - The package.json content of the forked repository.
 * @param depsToUpdate - Depenencies to update with their new versions.
 * @param devDepsToUpdate - Dev dependencies to update with their new versions.
 *
 * @returns An array of formatted summary lines.
 */
export function packageSummaryLines(
  analyzedFile: FileAnalysis,
  forkPackageJson: PackageJson | null,
  depsToUpdate: Record<string, string>,
  devDepsToUpdate: Record<string, string>,
): string[] {
  // Calculate the number of dependencies and dev dependencies to update
  const amountOfDepsToUpdate = Object.keys(depsToUpdate).length;
  const amountOfDevDepsToUpdate = Object.keys(devDepsToUpdate).length;

  // Initialize the summary lines array
  const lines: string[] = [DIVIDER, pc.bold(`${analyzedFile.filePath}:`)];

  // Notify if no dependencies need updating
  if (!amountOfDepsToUpdate && !amountOfDevDepsToUpdate) {
    lines.push(pc.gray('  - no dependencies to update'));
  } else {
    // List dependencies and their version updates
    lines.push('dependencies:');
    if (!amountOfDepsToUpdate) {
      lines.push(pc.gray('  - no dependencies to update'));
    } else {
      for (const dep in depsToUpdate) {
        lines.push(`  - ${dep}: ${forkPackageJson?.dependencies?.[dep]} → ${pc.bold(pc.cyan(depsToUpdate[dep]))}`);
      }
    }

    // List dev dependencies and their version updates
    lines.push('dev dependencies:');
    if (!amountOfDevDepsToUpdate) {
      lines.push(pc.gray('  - no dev dependencies to update'));
    } else {
      for (const dep in devDepsToUpdate) {
        lines.push(
          `  - ${dep}: ${forkPackageJson?.devDependencies?.[dep]} → ${pc.bold(pc.cyan(devDepsToUpdate[dep]))}`,
        );
      }
    }
  }

  lines.push(DIVIDER);
  return lines;
}

/**
 * Checks if the package summary module should be logged based on configuration.
 *
 * @returns Whether the package summary module should be logged.
 */
export function shouldLogPackageSummaryModule(): boolean {
  const logModulesConfigured = 'modules' in config.log;

  if (!logModulesConfigured) {
    return true;
  }

  return config.log.modules?.includes('packageSummary') || false;
}

/**
 * Logs the package summary lines to the console if logging is enabled for the module.
 *
 * @param lines - The summary lines to log.
 *
 * @returns void
 */
export function logPackageSummaryLines(lines: string[]): void {
  if (lines.length === 0) {
    return;
  }

  if (!shouldLogPackageSummaryModule()) {
    return;
  }

  for (const line of lines) {
    console.info(line);
  }
}
