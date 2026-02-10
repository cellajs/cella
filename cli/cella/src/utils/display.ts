/**
 * Display utilities for sync CLI v2.
 *
 * Handles console output formatting, progress tracking, and result display.
 */

import { writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import ora, { type Ora } from 'ora';
import pc from 'picocolors';
import packageJson from '../../package.json' with { type: 'json' };
import type { AnalysisSummary, AnalyzedFile, FileStatus, MergeResult } from '../config/types';

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
  stopSpinner();
  if (message) {
    printStep(message, detail);
  }
}

/**
 * Stop the active spinner with failure.
 */
export function spinnerFail(message: string): void {
  stopSpinner();
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
 * Stop and clear the active spinner.
 */
function stopSpinner(): void {
  if (activeSpinner) {
    activeSpinner.stop();
    activeSpinner = null;
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

/**
 * Print a section header with title and divider.
 */
function printSectionHeader(title: string): void {
  console.info();
  console.info(title);
  console.info(DIVIDER);
  console.info();
}

/**
 * Format file date info with link for display.
 */
function formatFileDateInfo(
  filePath: string,
  commit: string | undefined,
  date: string | undefined,
  linkOptions: LinkOptions,
): string {
  const link = getFileLink(filePath, commit, linkOptions);
  const linkLabel = link.label ? hyperlink(link.label, link.url) : '';
  return date ? pc.dim(` ≠ ${date} ${linkLabel}`) : '';
}

/** Display configuration for a file status */
interface StatusConfig {
  icon: string;
  label: string;
  color: (text: string) => string;
  description?: string;
}

/** Unified status display config: icon, label, color, and description for each status. Key order defines sort priority. */
const statusConfig: Record<FileStatus, StatusConfig> = {
  behind: { icon: pc.cyan('↓'), label: 'behind', color: pc.cyan, description: 'upstream changed, will sync' },
  diverged: { icon: pc.magenta('⇅'), label: 'diverged', color: pc.magenta, description: 'both changed, will merge' },
  drifted: { icon: pc.yellow('!'), label: 'drifted', color: pc.yellow, description: 'fork changed (at risk)' },
  ahead: { icon: pc.blue('↑'), label: 'ahead', color: pc.blue, description: 'fork changed (protected)' },
  pinned: { icon: pc.green('⨀'), label: 'pinned', color: pc.green, description: 'both changed, fork wins' },
  ignored: { icon: pc.gray('⨂'), label: 'ignored', color: pc.gray },
  identical: { icon: pc.gray('✓'), label: 'identical', color: pc.gray, description: 'no changes' },
  deleted: { icon: pc.red('✗'), label: 'deleted', color: pc.red },
  renamed: { icon: pc.blue('→'), label: 'renamed', color: pc.blue },
};

/** Ordered status keys derived from statusConfig key order */
const statusOrder = Object.keys(statusConfig) as FileStatus[];

/**
 * Print the analysis summary.
 */
export function printSummary(summary: AnalysisSummary, title = 'summary'): void {
  printSectionHeader(pc.cyan(title));

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

  // Helper to print a status line using unified config
  const printLine = (status: FileStatus, count: number) => {
    const { icon, label, color, description } = statusConfig[status];
    const countStr = color(String(count).padStart(countWidth));
    const desc = description ? pc.dim(description) : '';
    console.info(`  ${icon} ${countStr}  ${label.padEnd(15)}${desc}`);
  };

  // Grouped layout with blank lines between groups
  printLine('identical', summary.identical);

  console.info();
  printLine('ahead', summary.ahead);
  printLine('drifted', summary.drifted);

  console.info();
  printLine('diverged', summary.diverged);
  printLine('pinned', summary.pinned);

  console.info();
  printLine('behind', summary.behind);
}

/**
 * Print files that will sync from upstream.
 */
export function printSyncFiles(files: AnalyzedFile[], linkOptions: LinkOptions): void {
  const syncFiles = files.filter((f) => f.status === 'behind');

  if (syncFiles.length === 0) return;

  printSectionHeader(pc.cyan('↓ behind on upstream') + pc.dim(` · ${syncFiles.length} files`));

  for (const file of syncFiles) {
    const dateInfo = formatFileDateInfo(file.path, file.changedCommit, file.changedAt, linkOptions);
    console.info(`  ${statusConfig.behind.icon} ${file.path}${dateInfo}`);
  }
}

/**
 * Print drifted files warning.
 */
export function printDriftedWarning(files: AnalyzedFile[], linkOptions: LinkOptions): void {
  const driftedFiles = files.filter((f) => f.status === 'drifted');

  if (driftedFiles.length === 0) return;

  printSectionHeader(`${pc.yellow('⚠ drifted from upstream')} ${pc.dim(`· ${driftedFiles.length} files`)}`);

  for (const file of driftedFiles) {
    const dateInfo = formatFileDateInfo(file.path, file.changedCommit, file.changedAt, linkOptions);
    console.info(`  ${statusConfig.drifted.icon} ${file.path}${dateInfo}`);
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

  printSectionHeader(`${pc.magenta('⇅ diverged')} ${pc.dim(`· ${divergedFiles.length} files`)}`);

  for (const file of divergedFiles) {
    const dateInfo = formatFileDateInfo(file.path, file.upstreamCommit, file.upstreamChangedAt, linkOptions);
    console.info(`  ${statusConfig.diverged.icon} ${file.path}${dateInfo}`);
  }

  console.info();
  console.info(pc.dim('  Both fork and upstream changed.'));
}

/**
 * Print pinned files preview for analyze mode.
 * These files have both fork and upstream changes, but fork changes take precedence.
 */
export function printPinnedPreview(files: AnalyzedFile[], linkOptions: LinkOptions): void {
  const pinnedFiles = files.filter((f) => f.status === 'pinned');

  if (pinnedFiles.length === 0) return;

  printSectionHeader(`${pc.green('⨀ pinned')} ${pc.dim(`· ${pinnedFiles.length} files`)}`);

  for (const file of pinnedFiles) {
    const dateInfo = formatFileDateInfo(file.path, file.upstreamCommit, file.upstreamChangedAt, linkOptions);
    console.info(`  ${statusConfig.pinned.icon} ${file.path}${dateInfo}`);
  }

  console.info();
  console.info(pc.dim('  Both changed, fork wins (pinned in cella.config.ts).'));
}

/**
 * Print actual unresolved conflicts after sync.
 * These require manual intervention to resolve.
 */
export function printConflicts(conflicts: string[]): void {
  if (conflicts.length === 0) return;

  printSectionHeader(`${pc.red('✗')} Unresolved conflicts (${conflicts.length} files)`);

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
    const aOrder = statusOrder.indexOf(a.status);
    const bOrder = statusOrder.indexOf(b.status);
    if (aOrder !== bOrder) return aOrder - bOrder;
    return a.path.localeCompare(b.path);
  });

  for (const file of sortedFiles) {
    const config = statusConfig[file.status];
    const icon = config.icon.replace(/\x1b\[[0-9;]*m/g, ''); // Strip ANSI
    lines.push(`  ${icon} ${config.label.padEnd(12)} ${file.path}`);
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
