import pc from 'picocolors';
import { config } from '../config';
import { DIVIDER } from '../constants';
import { KeyUpdateSummary } from '../modules/package/get-values-to-update';
import { FileAnalysis, PackageJson } from '../types';

/**
 * Formats a single key update for display.
 */
function formatKeyUpdate(
  keyUpdate: KeyUpdateSummary,
  forkPackageJson: PackageJson | null,
): string[] {
  const lines: string[] = [];
  const { key, type, updates } = keyUpdate;

  lines.push(`${key}:`);

  switch (type) {
    case 'dependencies':
      // Show each dependency update with version change
      for (const dep in updates as Record<string, string>) {
        const oldVersion = (forkPackageJson?.[key] as Record<string, string>)?.[dep];
        const newVersion = (updates as Record<string, string>)[dep];
        lines.push(`  - ${dep}: ${oldVersion} → ${pc.bold(pc.cyan(newVersion))}`);
      }
      break;

    case 'object':
      // Show which keys in the object are updated
      for (const objKey in updates as Record<string, unknown>) {
        lines.push(`  - ${objKey}: ${pc.bold(pc.cyan('updated'))}`);
      }
      break;

    case 'array':
      lines.push(`  - ${pc.bold(pc.cyan('replaced'))}`);
      break;

    case 'primitive':
      const oldVal = forkPackageJson?.[key];
      lines.push(`  - ${oldVal} → ${pc.bold(pc.cyan(String(updates)))}`);
      break;
  }

  return lines;
}

/**
 * Generates summary lines for a package.json file analysis.
 *
 * @param analyzedFile - The analyzed file information.
 * @param forkPackageJson - The package.json content of the forked repository.
 * @param keyUpdates - Array of key updates to apply.
 *
 * @returns An array of formatted summary lines.
 */
export function packageSummaryLines(
  analyzedFile: FileAnalysis,
  forkPackageJson: PackageJson | null,
  keyUpdates: KeyUpdateSummary[],
): string[] {
  // Initialize the summary lines array
  const lines: string[] = [DIVIDER, pc.bold(`${analyzedFile.filePath}:`)];

  // Notify if no keys need updating
  if (keyUpdates.length === 0) {
    lines.push(pc.gray('  - no updates needed'));
  } else {
    // Format each key update
    for (const keyUpdate of keyUpdates) {
      lines.push(...formatKeyUpdate(keyUpdate, forkPackageJson));
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
