/**
 * Logging utilities for analyzed summary output.
 */
import pc from 'picocolors';
import { config } from '#/config';
import type { FileAnalysis } from '#/types';

/**
 * Generates summary lines from the analyzed files.
 * Returns a compact single-line summary with inline badges.
 */
export function analyzedSummaryLines(analyzedFiles: FileAnalysis[]): string[] {
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
    summary.totalFiles++;

    const gitStatus = file.commitSummary?.status || 'unknown';
    if (gitStatus in summary) {
      (summary as Record<string, number>)[gitStatus]++;
    } else {
      summary.unknown++;
    }

    if (file.overrideStatus === 'customized') {
      summary.customized++;
    } else if (file.overrideStatus === 'ignored') {
      summary.ignored++;
    }
  }

  const badges: string[] = [
    pc.green(`↑${summary.ahead} ahead`),
    pc.yellow(`↓${summary.behind} behind`),
    pc.red(`⚡${summary.diverged} diverged`),
    pc.red(`⚠${summary.unrelated} unrelated`),
  ];

  if (summary.unknown > 0) badges.push(pc.red(`?${summary.unknown} unknown`));

  const overrideInfo: string[] = [];
  if (summary.customized > 0) overrideInfo.push(`${summary.customized} customized`);
  if (summary.ignored > 0) overrideInfo.push(`${summary.ignored} ignored`);
  const overrideBadge = overrideInfo.length > 0 ? pc.cyan(`🔧 ${overrideInfo.join(', ')}`) : '';

  const parts = [`${pc.green('✓')} ${summary.totalFiles} files synced`];
  parts.push(badges.join('  '));
  if (overrideBadge) parts.push(overrideBadge);

  return [parts.join(' │ ')];
}

/** Checks if the analyzed summary module should be logged based on configuration. */
export function shouldLogAnalyzedSummaryModule(): boolean {
  const logModulesConfigured = 'modules' in config.log;
  if (!logModulesConfigured) return true;
  return config.log.modules?.includes('analyzedSummary') || false;
}

/** Logs the analyzed summary lines to the console. */
export function logAnalyzedSummaryLines(lines: string[]): void {
  if (lines.length === 0) return;

  if (shouldLogAnalyzedSummaryModule()) {
    for (const line of lines) {
      console.info(line);
    }
  }
}
