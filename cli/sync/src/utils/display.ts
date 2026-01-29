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
export const NAME = 'cella cli';

/** Version from package.json */
export const VERSION = packageJson.version;

/** Line divider */
export const DIVIDER = '─'.repeat(60);

/** Active spinner reference */
let activeSpinner: Spinner | null = null;

/** Track completed steps for persistent display */
interface CompletedStep {
  label: string;
  detail?: string;
}
const completedSteps: CompletedStep[] = [];

/**
 * Get the header line for CLI output.
 */
export function getHeader(): string {
  const right = 'cellajs.com';
  // Account for ANSI codes when calculating padding
  const visibleLeft = `⧈ ${NAME} v${VERSION}`;
  const padding = Math.max(1, 60 - visibleLeft.length - right.length);
  return pc.cyan(`⧈ ${NAME}`) + `${pc.dim(` · v${VERSION}`)}` + pc.cyan(`${' '.repeat(padding)}${right}`);
}

/**
 * Print the welcome header.
 */
export function printHeader(): void {
  console.info();
  console.info(getHeader());
  console.info(DIVIDER);
  console.info();
}

/**
 * Reset completed steps (call at start of each service).
 */
export function resetSteps(): void {
  completedSteps.length = 0;
}

/**
 * Print a completed step with checkmark.
 * Optionally include a detail line in grey, followed by a blank line.
 */
export function printStep(label: string, detail?: string): void {
  console.info(`${pc.green('✓')} ${label}`);
  if (detail) {
    console.info(`  ${pc.dim(detail)}`);
    console.info(); // blank line after detail block
  }
  completedSteps.push({ label, detail });
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
 * Stop the active spinner with success and print step.
 */
export function spinnerSuccess(message?: string, detail?: string): void {
  if (activeSpinner) {
    activeSpinner.stop();
    activeSpinner = null;
  }
  if (message) {
    printStep(message, detail);
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

/**
 * Create a clickable hyperlink for terminals that support OSC 8.
 * Falls back to just the label if no URL provided.
 */
function hyperlink(label: string, url?: string): string {
  if (!url) return label;
  // OSC 8 hyperlink format: \x1b]8;;URL\x07LABEL\x1b]8;;\x07
  return `\x1b]8;;${url}\x07${label}\x1b]8;;\x07`;
}

/** Status icons */
const statusIcons: Record<string, string> = {
  identical: pc.gray('✓'),
  ahead: pc.blue('↑'),
  drifted: pc.yellow('!'),
  behind: pc.cyan('↓'),
  diverged: pc.magenta('⇅'),
  pinned: pc.green('⨀'),
  ignored: pc.gray('⨂'),
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

/** Status colors for summary counts */
const statusColors: Record<string, (text: string) => string> = {
  identical: pc.gray,
  ahead: pc.blue,
  drifted: pc.yellow,
  behind: pc.cyan,
  diverged: pc.magenta,
  pinned: pc.green,
  ignored: pc.gray,
  deleted: pc.red,
};

/**
 * Print the analysis summary.
 */
export function printSummary(summary: AnalysisSummary, title = 'summary'): void {
  console.info();
  console.info(pc.cyan(title));
  console.info(DIVIDER);
  console.info();

  // Format counts with padding (exclude ignored from max calculation)
  const maxCount = Math.max(
    summary.identical,
    summary.ahead,
    summary.drifted,
    summary.behind,
    summary.diverged,
    summary.pinned,
  );
  const countWidth = String(maxCount).length + 1;

  // Helper to print a status line
  const printLine = (status: string, icon: string, count: number, label: string) => {
    const colorFn = statusColors[status];
    const countStr = colorFn(String(count).padStart(countWidth));
    console.info(`  ${icon} ${countStr}  ${label}`);
  };

  // Grouped layout with blank lines between groups
  printLine('identical', statusIcons.identical, summary.identical, `identical      ${pc.dim('no changes')}`);

  console.info();
  printLine('ahead', statusIcons.ahead, summary.ahead, `ahead          ${pc.dim('fork changed (protected)')}`);
  printLine('drifted', statusIcons.drifted, summary.drifted, `drifted        ${pc.dim('fork changed (at risk)')}`);

  console.info();
  printLine('diverged', statusIcons.diverged, summary.diverged, `diverged       ${pc.dim('both changed, will merge')}`);
  printLine('pinned', statusIcons.pinned, summary.pinned, `pinned         ${pc.dim('both changed, fork wins')}`);

  console.info();
  printLine('behind', statusIcons.behind, summary.behind, `behind         ${pc.dim('upstream changed, will sync')}`);
}

/**
 * Print files that will sync from upstream.
 */
export function printSyncFiles(files: AnalyzedFile[], upstreamGitHubUrl?: string, forkGitHubUrl?: string): void {
  const syncFiles = files.filter((f) => f.status === 'behind' || f.status === 'diverged');

  if (syncFiles.length === 0) return;

  console.info();
  console.info(pc.cyan('↓ behind on upstream') + pc.dim(` · ${syncFiles.length} files`));
  console.info(DIVIDER);
  console.info();

  for (const file of syncFiles) {
    const icon = statusIcons[file.status];
    // behind = upstream changed, use upstream URL; diverged = both changed, use fork URL
    const baseUrl = file.status === 'behind' ? upstreamGitHubUrl : forkGitHubUrl;
    const commitUrl = file.changedCommit && baseUrl ? `${baseUrl}/commit/${file.changedCommit}` : undefined;
    const commitLabel = file.changedCommit ? hyperlink(file.changedCommit, commitUrl) : '';
    const dateInfo = file.changedAt ? pc.dim(` \u2260 ${file.changedAt} ${commitLabel}`) : '';
    console.info(`  ${icon} ${file.path}${dateInfo}`);
  }
}

/**
 * Print drifted files warning.
 */
export function printDriftedWarning(files: AnalyzedFile[], forkGitHubUrl?: string): void {
  const driftedFiles = files.filter((f) => f.status === 'drifted');

  if (driftedFiles.length === 0) return;

  console.info();
  console.info(`${pc.yellow('⚠ drifted from upstream')} ${pc.dim(`· ${driftedFiles.length} files`)}`);
  console.info(DIVIDER);
  console.info();

  for (const file of driftedFiles) {
    // Drifted = fork changed, use fork URL
    const commitUrl = file.changedCommit && forkGitHubUrl ? `${forkGitHubUrl}/commit/${file.changedCommit}` : undefined;
    const commitLabel = file.changedCommit ? hyperlink(file.changedCommit, commitUrl) : '';
    const dateInfo = file.changedAt ? pc.dim(` \u2260 ${file.changedAt} ${commitLabel}`) : '';
    console.info(`  ${statusIcons.drifted} ${file.path}${dateInfo}`);
  }

  console.info();
  console.info(pc.dim('  These files have fork changes but are NOT pinned or ignored.'));
}

/**
 * Print diverged files preview for analyze mode.
 * These will be merged by git - some may auto-merge, others may conflict.
 */
export function printDivergedPreview(divergedFiles: string[]): void {
  if (divergedFiles.length === 0) return;

  console.info();
  console.info(`${pc.magenta('⇅ diverged')} ${pc.dim(`· ${divergedFiles.length} files`)}`);
  console.info(DIVIDER);
  console.info();

  for (const file of divergedFiles) {
    console.info(`  ${pc.cyan('!')} ${file}`);
  }

  console.info();
  console.info(pc.dim('  Both fork and upstream changed. Git will merge; conflicts require manual resolution.'));
}

/**
 * Print actual unresolved conflicts after sync.
 * These require manual intervention to resolve.
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
}

/**
 * Write full file list to log file.
 */
export function writeLogFile(forkPath: string, files: AnalyzedFile[]): string {
  const logPath = join(forkPath, 'cella-sync.log');

  const lines: string[] = [
    `cella sync analysis - ${new Date().toISOString()}`,
    DIVIDER,
    '',
    `complete file list (${files.length} files)`,
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
}

/**
 * Print sync completion message.
 */
export function printSyncComplete(result: MergeResult): void {
  const updated = result.summary.behind + result.summary.diverged;
  const merged = result.summary.diverged;
  const conflicts = result.conflicts.length;

  console.info();
  console.info(`${pc.green('✓')} sync complete`);
  console.info();
  console.info(`  ${updated} files updated, ${merged} merged, ${conflicts} conflicts`);
  console.info();
}
