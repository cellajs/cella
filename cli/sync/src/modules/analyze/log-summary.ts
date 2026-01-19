/**
 * Logging utilities for analyzed summary output.
 */
import pc from 'picocolors';
import { DIVIDER } from '#/constants';
import { type DisplayLabel, getDisplayLabel, STATUS_CONFIG } from '#/constants/status';
import type { FileAnalysis } from '#/types';

/** Pads a number to 4 characters for alignment */
const pad = (n: number) => String(n).padStart(6, ' ');

/** Creates a summary line with consistent formatting */
function summaryLine(label: DisplayLabel, count: number, indent = ''): string {
  const { symbol, colorFn, action } = STATUS_CONFIG[label];
  const padding = ' '.repeat(Math.max(0, 24 - label.length - indent.length));
  return `${indent}${colorFn(symbol)}${colorFn(pad(count))} ${label}${padding}${pc.dim(action)}`;
}

/**
 * Generates summary lines from the analyzed files.
 */
export function analyzedSummaryLines(analyzedFiles: FileAnalysis[]): string[] {
  const counts: Record<DisplayLabel, number> = {
    identical: 0,
    ahead: 0,
    drifted: 0,
    behind: 0,
    diverged: 0,
    locked: 0,
    unrelated: 0,
    unknown: 0,
  };

  for (const file of analyzedFiles) {
    const gitStatus = file.commitSummary?.status || 'unknown';
    const isPinned = file.overrideStatus === 'pinned';
    const isIgnored = file.overrideStatus === 'ignored';
    const override = isPinned ? 'pinned' : isIgnored ? 'ignored' : 'none';

    const label = getDisplayLabel(gitStatus as Parameters<typeof getDisplayLabel>[0], override);
    counts[label]++;

    // Also count parent categories for tree display
    if (label === 'drifted') counts.ahead++;
    if (label === 'locked') counts.diverged++;
  }

  return [
    pc.cyan('sync summary'),
    DIVIDER,
    summaryLine('identical', counts.identical),
    '',
    summaryLine('ahead', counts.ahead),
    summaryLine('drifted', counts.drifted, '└ '),
    '',
    summaryLine('diverged', counts.diverged),
    summaryLine('locked', counts.locked, '└ '),
    '',
    summaryLine('behind', counts.behind),
    '',
    summaryLine('unrelated', counts.unrelated),
    '',
    ...(counts.unknown > 0 ? [summaryLine('unknown', counts.unknown), ''] : []),
  ];
}

/** Checks if the analyzed summary module should be logged based on configuration. */
export function shouldLogAnalyzedSummaryModule(): boolean {
  return true;
}

/** Logs the analyzed summary lines to the console. */
export function logAnalyzedSummaryLines(lines: string[]): void {
  for (const line of lines) console.info(line);
}
