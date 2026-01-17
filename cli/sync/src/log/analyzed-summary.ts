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
    customized: 0,
    ignored: 0,
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

    // Increment override counts
    if (file.overrideStatus === 'customized') {
      summary.customized++;
    } else if (file.overrideStatus === 'ignored') {
      summary.ignored++;
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

  // Show override counts if any
  const overrideInfo: string[] = [];
  if (summary.customized > 0) overrideInfo.push(`${summary.customized} customized`);
  if (summary.ignored > 0) overrideInfo.push(`${summary.ignored} ignored`);
  const overrideBadge = overrideInfo.length > 0 ? pc.cyan(`🔧 ${overrideInfo.join(', ')}`) : '';

  // Build line: ✓ count files synced │ badges │ overrides
  const parts = [`${pc.green('✓')} ${summary.totalFiles} files synced`];
  parts.push(badges.join('  '));
  if (overrideBadge) parts.push(overrideBadge);

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
