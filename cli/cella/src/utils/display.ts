/**
 * Display utilities for sync CLI v2.
 *
 * Handles console output formatting, progress tracking, and result display.
 */

import { writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import ora, { type Ora } from 'ora';
import pc from 'picocolors';
// Import package.json for version
import packageJson from '../../package.json' with { type: 'json' };
import type { AnalysisSummary, AnalyzedFile, MergeResult } from '../config/types';

/** CLI name */
export const NAME = 'cella cli';

/** Version from package.json */
export const VERSION = packageJson.version;

/** Options for generating links in CLI output */
export interface LinkOptions {
  /** Base GitHub URL for upstream (e.g., 'https://github.com/cellajs/cella') */
  upstreamGitHubUrl?: string;
  /** Upstream branch name for file links */
  upstreamBranch?: string;
  /** File link mode: 'commit' links to commit, 'file' links to file in repo, 'local' opens in VS Code */
  fileLinkMode?: 'commit' | 'file' | 'local';
  /** Path to local upstream clone for 'local' fileLinkMode (resolved relative to forkPath) */
  upstreamLocalPath?: string;
  /** Fork repository path for resolving relative upstreamLocalPath */
  forkPath?: string;
}

/** Line divider */
export const DIVIDER = '─'.repeat(60);

/** Active spinner reference */
let activeSpinner: Ora | null = null;

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
 * Uses isSilent in test environments to suppress output.
 */
export function createSpinner(text: string): Ora {
  const isTestEnv = !!process.env.VITEST || process.env.NODE_ENV === 'test';
  activeSpinner = ora({ text, isSilent: isTestEnv });
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

/**
 * Generate a link for a file based on link style.
 * Returns { label, url } for use with hyperlink().
 */
function getFileLink(
  filePath: string,
  commitHash: string | undefined,
  options: LinkOptions,
): { label: string; url?: string } {
  const { upstreamGitHubUrl, upstreamBranch, fileLinkMode = 'commit', upstreamLocalPath, forkPath } = options;

  if (fileLinkMode === 'local' && upstreamLocalPath && forkPath) {
    // Open file in VS Code: vscode://file/absolute/path/to/file
    // Resolve upstreamLocalPath relative to forkPath
    const absolutePath = resolve(forkPath, upstreamLocalPath, filePath);
    const url = `vscode://file${absolutePath}`;
    return { label: filePath.split('/').pop() || filePath, url };
  }

  if (!upstreamGitHubUrl) {
    return { label: commitHash?.slice(0, 9) || '' };
  }

  if (fileLinkMode === 'file' && upstreamBranch) {
    // Link to file in repo: https://github.com/org/repo/blob/branch/path/to/file
    const url = `${upstreamGitHubUrl}/blob/${upstreamBranch}/${filePath}`;
    return { label: filePath.split('/').pop() || filePath, url };
  }

  // Default: link to commit
  if (commitHash) {
    const url = `${upstreamGitHubUrl}/commit/${commitHash}`;
    return { label: commitHash.slice(0, 9), url };
  }

  return { label: '' };
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
export function printSyncFiles(files: AnalyzedFile[], linkOptions: LinkOptions): void {
  const syncFiles = files.filter((f) => f.status === 'behind');

  if (syncFiles.length === 0) return;

  console.info();
  console.info(pc.cyan('↓ behind on upstream') + pc.dim(` · ${syncFiles.length} files`));
  console.info(DIVIDER);
  console.info();

  for (const file of syncFiles) {
    const icon = statusIcons[file.status];
    const link = getFileLink(file.path, file.changedCommit, linkOptions);
    const linkLabel = link.label ? hyperlink(link.label, link.url) : '';
    const dateInfo = file.changedAt ? pc.dim(` ≠ ${file.changedAt} ${linkLabel}`) : '';
    console.info(`  ${icon} ${file.path}${dateInfo}`);
  }
}

/**
 * Print drifted files warning.
 */
export function printDriftedWarning(files: AnalyzedFile[], linkOptions: LinkOptions): void {
  const driftedFiles = files.filter((f) => f.status === 'drifted');

  if (driftedFiles.length === 0) return;

  console.info();
  console.info(`${pc.yellow('⚠ drifted from upstream')} ${pc.dim(`· ${driftedFiles.length} files`)}`);
  console.info(DIVIDER);
  console.info();

  for (const file of driftedFiles) {
    const link = getFileLink(file.path, file.changedCommit, linkOptions);
    const linkLabel = link.label ? hyperlink(link.label, link.url) : '';
    const dateInfo = file.changedAt ? pc.dim(` ≠ ${file.changedAt} ${linkLabel}`) : '';
    console.info(`  ${statusIcons.drifted} ${file.path}${dateInfo}`);
  }

  console.info();
  console.info(pc.dim('  These files have fork changes but are NOT pinned or ignored.'));
}

/**
 * Print diverged files preview for analyze mode.
 * These will be merged by git - some may auto-merge, others may conflict.
 */
export function printDivergedPreview(files: AnalyzedFile[], linkOptions: LinkOptions): void {
  const divergedFiles = files.filter((f) => f.status === 'diverged');

  if (divergedFiles.length === 0) return;

  console.info();
  console.info(`${pc.magenta('⇅ diverged')} ${pc.dim(`· ${divergedFiles.length} files`)}`);
  console.info(DIVIDER);
  console.info();

  for (const file of divergedFiles) {
    const link = getFileLink(file.path, file.upstreamCommit, linkOptions);
    const linkLabel = link.label ? hyperlink(link.label, link.url) : '';
    const dateInfo = file.upstreamChangedAt ? pc.dim(` ≠ ${file.upstreamChangedAt} ${linkLabel}`) : '';
    console.info(`  ${statusIcons.diverged} ${file.path}${dateInfo}`);
  }

  console.info();
  console.info(pc.dim('  Both fork and upstream changed.'));
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
