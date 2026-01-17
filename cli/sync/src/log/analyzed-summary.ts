import pc from 'picocolors';
import { config } from '../config';
import { FileAnalysis } from '../types';

/**
 * Generates summary lines from the analyzed files.
 * Returns a compact single-line summary with inline badges.
 *
 * @param analyzedFiles - Array of FileAnalysis objects.
 *
 * @returns An array of summary lines (single line in compact format).
 */
export function analyzedSummaryLines(analyzedFiles: FileAnalysis[]): string[] {
  // Initialize summary counts
  const summary = {
    totalFiles: 0,
    upToDate: 0,
    ahead: 0,
    behind: 0,
    diverged: 0,
    unrelated: 0,
    unknown: 0,
    swizzled: 0,
    swizzledNew: 0,
  };

  for (const file of analyzedFiles) {
    // Increment total files count
    summary.totalFiles++;

    // Increment count based on git status
    const gitStatus = file.commitSummary?.status || 'unknown';

    if (gitStatus in summary) {
      (summary as Record<string, number>)[gitStatus]++;
    } else {
      summary.unknown++;
    }

    // Increment swizzle counts
    const swizzle = file.swizzle;
    if (swizzle) {
      if (swizzle?.existingMetadata?.swizzled || swizzle?.newMetadata?.swizzled) {
        summary.swizzled++;

        if (swizzle.newMetadata?.swizzled) {
          summary.swizzledNew++;
        }
      }
    }
  }

  // Build compact inline badge summary
  // Format: ✓ 1729 files synced │ ↓42 behind  ⚡15 diverged │ 🔧23 swizzled
  const badges: string[] = [
    pc.green(`↑${summary.ahead} ahead`),
    pc.yellow(`↓${summary.behind} behind`),
    pc.red(`⚡${summary.diverged} diverged`),
    pc.red(`⚠${summary.unrelated} unrelated`),
  ];

  // Only show unknown if > 0
  if (summary.unknown > 0) badges.push(pc.red(`?${summary.unknown} unknown`));

  const swizzleInfo =
    summary.swizzledNew > 0
      ? pc.cyan(`🔧${summary.swizzled} swizzled (${summary.swizzledNew} new)`)
      : pc.cyan(`🔧${summary.swizzled} swizzled`);

  // Build line: ✓ count files synced │ badges │ swizzle
  const parts = [`${pc.green('✓')} ${summary.totalFiles} files synced`];
  parts.push(badges.join('  '));
  parts.push(swizzleInfo);

  return [parts.join(' │ ')];
}

/**
 * Determines if the analyzed summary module should be logged based on the configuration.
 *
 * @returns Whether the analyzed summary module should be logged.
 */
export function shouldLogAnalyzedSummaryModule(): boolean {
  const logModulesConfigured = 'modules' in config.log;

  if (!logModulesConfigured) {
    return true;
  }

  return config.log.modules?.includes('analyzedSummary') || false;
}

/**
 * Logs the analyzed summary lines to the console based on the configuration.
 *
 * @param lines - Array of summary lines to log.
 *
 * @returns void
 */
export function logAnalyzedSummaryLines(lines: string[]): void {
  if (lines.length === 0) {
    return;
  }

  if (shouldLogAnalyzedSummaryModule()) {
    for (const line of lines) {
      console.info(line);
    }
  }
}
