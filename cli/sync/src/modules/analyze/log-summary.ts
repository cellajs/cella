/**
 * Logging utilities for analyzed summary output.
 */
import pc from 'picocolors';
import { DIVIDER } from '#/constants';
import type { FileAnalysis } from '#/types';

/** Aggregated sync status counts for display. */
type SyncSummary = {
  totalFiles: number;
  identical: number;
  ahead: number;
  aheadPinned: number;
  behind: number;
  locked: number;
  drifted: number;
  conflict: number;
  unrelated: number;
  unknown: number;
};

/**
 * Generates summary lines from the analyzed files.
 * Returns a detailed multi-line summary with inline descriptions.
 */
export function analyzedSummaryLines(analyzedFiles: FileAnalysis[]): string[] {
  const summary: SyncSummary = {
    totalFiles: 0,
    identical: 0,
    ahead: 0,
    aheadPinned: 0,
    behind: 0,
    locked: 0,
    drifted: 0,
    conflict: 0,
    unrelated: 0,
    unknown: 0,
  };

  for (const file of analyzedFiles) {
    summary.totalFiles++;

    const gitStatus = file.commitSummary?.status || 'unknown';
    const isPinned = file.overrideStatus === 'pinned';
    const isIgnored = file.overrideStatus === 'ignored';
    const isProtected = isPinned || isIgnored;

    if (gitStatus === 'upToDate') {
      summary.identical++;
    } else if (gitStatus === 'ahead') {
      if (isProtected) {
        summary.ahead++;
        summary.aheadPinned++;
      } else {
        summary.drifted++;
      }
    } else if (gitStatus === 'behind') {
      summary.behind++;
    } else if (gitStatus === 'diverged') {
      if (isPinned) {
        summary.locked++;
      } else {
        summary.conflict++;
      }
    } else if (gitStatus === 'unrelated') {
      summary.unrelated++;
    } else {
      summary.unknown++;
    }
  }

  const lines: string[] = [];

  // Header
  lines.push(pc.cyan('sync summary'));
  lines.push(DIVIDER);

  // Identical
  lines.push(
    `${pc.green('✓')} ${pc.green(padNum(summary.identical))} identical${pc.dim('                    no action needed')}`,
  );
  lines.push('');

  // Ahead (pinned = protected), drifted (unpinned ahead = at risk)
  lines.push(
    `${pc.blue('↑')} ${pc.blue(padNum(summary.ahead))} ahead${pc.dim('                        fork has newer commits, protected')}`,
  );
  lines.push(
    `${pc.red('⚡')}${pc.red(padNum(summary.drifted))} drifted${pc.dim('                      fork ahead, not protected (at risk)')}`,
  );
  lines.push('');

  // Behind (cyan), locked (yellow with lock), unrelated
  lines.push(
    `${pc.cyan('↓')} ${pc.cyan(padNum(summary.behind))} behind${pc.dim('                       will take upstream changes')}`,
  );
  lines.push(
    `${pc.yellow('🔒')}${pc.yellow(padNum(summary.locked))} locked${pc.dim('                       both sides changed, pinned to fork')}`,
  );
  lines.push(
    `${pc.red('⚡')}${pc.red(padNum(summary.conflict))} conflict${pc.dim('                     both sides changed, needs merge')}`,
  );
  lines.push(
    `${pc.magenta('⚠')} ${pc.magenta(padNum(summary.unrelated))} unrelated${pc.dim('                    no shared history')}`,
  );
  lines.push('');

  if (summary.unknown > 0) {
    lines.push(
      `${pc.red('?')} ${pc.red(padNum(summary.unknown))} unknown${pc.dim('                      could not determine status')}`,
    );
  }

  return lines;
}

/** Pads a number to 4 characters for alignment */
function padNum(n: number): string {
  return String(n).padStart(4, ' ');
}

/** Checks if the analyzed summary module should be logged based on configuration. */
export function shouldLogAnalyzedSummaryModule(): boolean {
  // Summary is always shown (it's compact and useful)
  return true;
}

/** Logs the analyzed summary lines to the console. */
export function logAnalyzedSummaryLines(lines: string[]): void {
  for (const line of lines) {
    console.info(line);
  }
}
