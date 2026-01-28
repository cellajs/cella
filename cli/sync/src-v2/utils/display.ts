/**
 * Display utilities for sync CLI v2.
 *
 * Handles console output formatting, progress tracking, and result display.
 */

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import pc from 'picocolors';
import yoctoSpinner, { type Spinner } from 'yocto-spinner';
// Import package.json for version
import packageJson from '../../package.json' with { type: 'json' };
import type { AnalysisSummary, AnalyzedFile, MergeResult } from '../config/types';

/** CLI name */
export const NAME = 'cella sync';

/** Version from package.json */
export const VERSION = packageJson.version;

/** Line divider */
export const DIVIDER = '─'.repeat(60);

/** Active spinner reference */
let activeSpinner: Spinner | null = null;

/**
 * Get the header line for CLI output.
 */
export function getHeader(): string {
  const left = `⚡ ${NAME} v${VERSION}`;
  const right = 'cellajs.com';
  const padding = Math.max(1, 60 - left.length - right.length);
  return `${left}${' '.repeat(padding)}${right}`;
}

/**
 * Print the welcome header.
 */
export function printHeader(): void {
  console.info();
  console.info(getHeader());
  console.info(DIVIDER);
}

/**
 * Create a progress spinner.
 */
export function createSpinner(text: string): Spinner {
  activeSpinner = yoctoSpinner({ text });
  activeSpinner.start();
  return activeSpinner;
}

/**
 * Stop the active spinner with success.
 */
export function spinnerSuccess(message?: string): void {
  if (activeSpinner) {
    activeSpinner.stop();
    activeSpinner = null;
    if (message) console.info(`${pc.green('✓')} ${message}`);
  }
}

/**
 * Stop the active spinner with failure.
 */
export function spinnerFail(message: string): void {
  if (activeSpinner) {
    activeSpinner.stop();
    activeSpinner = null;
  }
  console.info(`${pc.red('✗')} ${message}`);
}

/**
 * Update spinner text.
 */
export function spinnerText(text: string): void {
  if (activeSpinner) {
    activeSpinner.text = text;
  }
}

/** Status icons */
const statusIcons: Record<string, string> = {
  identical: pc.gray('✓'),
  ahead: pc.blue('↑'),
  drifted: pc.yellow('⚡'),
  behind: pc.cyan('↓'),
  diverged: pc.magenta('⇅'),
  pinned: pc.green('📌'),
  ignored: pc.gray('⊙'),
  deleted: pc.red('✗'),
  locked: pc.green('⊡'),
};

/** Status labels for summary */
const statusLabels: Record<string, string> = {
  identical: 'identical',
  ahead: 'ahead',
  drifted: 'drifted',
  behind: 'behind',
  diverged: 'diverged',
  pinned: 'pinned',
  ignored: 'ignored',
  deleted: 'deleted',
};

/**
 * Print the analysis summary.
 */
export function printSummary(summary: AnalysisSummary): void {
  console.info();
  console.info('Summary');
  console.info(DIVIDER);
  console.info();

  // Format counts with padding
  const maxCount = Math.max(
    summary.identical,
    summary.ahead,
    summary.drifted,
    summary.behind,
    summary.diverged,
    summary.pinned,
    summary.ignored,
    summary.deleted,
  );
  const countWidth = String(maxCount).length + 1;

  const lines: [string, number, string][] = [
    [statusIcons.identical, summary.identical, `${statusLabels.identical}      no action needed`],
    [statusIcons.ahead, summary.ahead, `${statusLabels.ahead}          fork is ahead (protected)`],
    [statusIcons.drifted, summary.drifted, `${statusLabels.drifted}        fork is ahead (NOT protected)`],
    [statusIcons.behind, summary.behind, `${statusLabels.behind}         will sync from upstream`],
    [statusIcons.diverged, summary.diverged, `${statusLabels.diverged}       will merge from upstream`],
    [statusIcons.pinned, summary.pinned, `${statusLabels.pinned}         both changed, keeping fork (pinned)`],
  ];

  for (const [icon, count, label] of lines) {
    if (count > 0 || label.includes('identical')) {
      const countStr = String(count).padStart(countWidth);
      console.info(`  ${icon} ${countStr}  ${label}`);
    }
  }
}

/**
 * Print files that will sync from upstream.
 */
export function printSyncFiles(files: AnalyzedFile[]): void {
  const syncFiles = files.filter((f) => f.status === 'behind' || f.status === 'diverged');

  if (syncFiles.length === 0) return;

  console.info();
  console.info(`Sync from upstream (${syncFiles.length} files)`);
  console.info(DIVIDER);
  console.info();

  for (const file of syncFiles) {
    const icon = statusIcons[file.status];
    console.info(`  ${icon} ${file.path}`);
  }
}

/**
 * Print drifted files warning.
 */
export function printDriftedWarning(files: AnalyzedFile[]): void {
  const driftedFiles = files.filter((f) => f.status === 'drifted');

  if (driftedFiles.length === 0) return;

  console.info();
  console.info(`${pc.yellow('⚠')} Drifted from upstream (${driftedFiles.length} files)`);
  console.info(DIVIDER);
  console.info();

  for (const file of driftedFiles) {
    console.info(`  ${statusIcons.drifted} ${file.path}`);
  }

  console.info();
  console.info(pc.dim('  These files have fork changes but are NOT pinned or ignored.'));
  console.info(pc.dim('  Consider adding to pinned before running sync.'));
}

/**
 * Print conflict warning.
 */
export function printConflicts(conflicts: string[]): void {
  if (conflicts.length === 0) return;

  console.info();
  console.info(`${pc.red('✗')} Unresolved conflicts (${conflicts.length} files)`);
  console.info(DIVIDER);
  console.info();

  for (const file of conflicts) {
    console.info(`  ${pc.red('!')} ${file}`);
  }

  console.info();
  console.info(pc.dim('  These conflicts must be resolved manually.'));
  console.info(pc.dim('  Add them to pinned or ignored to auto-resolve in future syncs.'));
}

/**
 * Write full file list to log file.
 */
export function writeLogFile(forkPath: string, files: AnalyzedFile[]): string {
  const logPath = join(forkPath, 'cella-sync.log');

  const lines: string[] = [
    `Cella Sync Analysis - ${new Date().toISOString()}`,
    DIVIDER,
    '',
    `Complete file list (${files.length} files)`,
    DIVIDER,
    '',
  ];

  // Sort files by status, then path
  const sortedFiles = [...files].sort((a, b) => {
    const statusOrder = ['behind', 'diverged', 'drifted', 'ahead', 'pinned', 'ignored', 'identical', 'deleted'];
    const aOrder = statusOrder.indexOf(a.status);
    const bOrder = statusOrder.indexOf(b.status);
    if (aOrder !== bOrder) return aOrder - bOrder;
    return a.path.localeCompare(b.path);
  });

  for (const file of sortedFiles) {
    const icon = statusIcons[file.status].replace(/\x1b\[[0-9;]*m/g, ''); // Strip ANSI
    const label = statusLabels[file.status] || file.status;
    lines.push(`  ${icon} ${label.padEnd(12)} ${file.path}`);
  }

  writeFileSync(logPath, lines.join('\n'), 'utf-8');
  return logPath;
}

/**
 * Print analyze completion message.
 */
export function printAnalyzeComplete(): void {
  console.info();
  console.info(pc.dim("This was a dry run. Run 'pnpm sync --service sync' to apply."));
}

/**
 * Print sync completion message.
 */
export function printSyncComplete(result: MergeResult): void {
  const updated = result.summary.behind + result.summary.diverged;
  const merged = result.summary.diverged;
  const removed = result.files.filter((f) => f.status === 'ignored' && f.existsInUpstream && !f.existsInFork).length;

  console.info();
  console.info(`${pc.green('✓')} Sync complete`);
  console.info();
  console.info(`  ${updated} files updated, ${merged} merged, ${removed} removed`);
  console.info();
  console.info(pc.dim("Run 'pnpm install' to update dependencies."));
}
