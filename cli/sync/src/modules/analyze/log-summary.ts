/**
 * Logging utilities for analyzed summary output.
 */
import pc from 'picocolors';
import type { FileAnalysis } from '#/types';

/**
 * Generates summary lines from the analyzed files.
 * Returns a detailed multi-line summary with inline descriptions.
 */
export function analyzedSummaryLines(analyzedFiles: FileAnalysis[]): string[] {
  const summary = {
    totalFiles: 0,
    identical: 0,
    ahead: 0,
    aheadPinned: 0,
    behind: 0,
    diverged: 0,
    unrelated: 0,
    unknown: 0,
  };

  for (const file of analyzedFiles) {
    summary.totalFiles++;

    const gitStatus = file.commitSummary?.status || 'unknown';
    const isPinned = file.overrideStatus === 'pinned';

    if (gitStatus === 'upToDate') {
      summary.identical++;
    } else if (gitStatus === 'ahead') {
      summary.ahead++;
      if (isPinned) summary.aheadPinned++;
    } else if (gitStatus === 'behind') {
      summary.behind++;
    } else if (gitStatus === 'diverged') {
      summary.diverged++;
    } else if (gitStatus === 'unrelated') {
      summary.unrelated++;
    } else {
      summary.unknown++;
    }
  }

  const aheadUnpinned = summary.ahead - summary.aheadPinned;
  const lines: string[] = [];

  // Header
  lines.push(pc.bold('Sync Summary'));
  lines.push('');

  // Identical
  lines.push(
    `  ${pc.green('✓')} ${padNum(summary.identical)} identical${pc.dim('                    no action needed')}`,
  );
  lines.push('');

  // Ahead with breakdown
  lines.push(
    `  ${pc.green('↑')} ${padNum(summary.ahead)} ahead${pc.dim('                        fork has newer commits')}`,
  );
  if (summary.ahead > 0) {
    lines.push(
      `      ${pc.dim('├─')} ${padNum(summary.aheadPinned)} pinned${pc.dim("                    protected, won't require merge")}`,
    );
    lines.push(
      `      ${pc.dim('└─')} ${padNum(aheadUnpinned)} unpinned${pc.dim('                  may want to add to config')}`,
    );
  }
  lines.push('');

  // Behind, diverged, unrelated
  lines.push(
    `  ${pc.yellow('↓')} ${padNum(summary.behind)} behind${pc.dim('                       will take upstream changes')}`,
  );
  lines.push(
    `  ${pc.red('⚡')} ${padNum(summary.diverged)} diverged${pc.dim('                     both sides changed, needs merge')}`,
  );
  lines.push(
    `  ${pc.red('⚠')} ${padNum(summary.unrelated)} unrelated${pc.dim('                    no shared history')}`,
  );

  if (summary.unknown > 0) {
    lines.push(
      `  ${pc.red('?')} ${padNum(summary.unknown)} unknown${pc.dim('                      could not determine status')}`,
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
