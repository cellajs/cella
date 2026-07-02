/**
 * Display utilities for sync CLI v2.
 *
 * Handles console output formatting, progress tracking, and result display.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import process from 'node:process';
import packageJson from '../../package.json' with { type: 'json' };
import type { AnalysisSummary, AnalyzedFile, FileStatus, MergeResult } from '../config/types';
import pc from './colors';

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
  /** Absolute path to a checked-out worktree of the upstream ref, used for VS Code diff/open links */
  upstreamViewPath?: string;
  /** Fork repository path for resolving file paths */
  forkPath?: string;
}

/** Line divider */
export const DIVIDER = '─'.repeat(60);

/** Warning mark for non-fatal warnings */
export const warningMark = pc.yellow('⚠');

/** Check mark for successful status lines */
export const checkMark = pc.green('✓');

interface Spinner {
  text: string;
  start(): Spinner;
  stop(): void;
}

class TerminalSpinner implements Spinner {
  private readonly frames = ['-', '\\', '|', '/'];
  private frameIndex = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly enabled: boolean;

  constructor(
    public text: string,
    isSilent: boolean,
  ) {
    this.enabled = !isSilent && !!process.stdout.isTTY;
  }

  start(): Spinner {
    if (!this.enabled || this.timer) return this;

    this.render();
    this.timer = setInterval(() => {
      this.frameIndex = (this.frameIndex + 1) % this.frames.length;
      this.render();
    }, 80);

    return this;
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }

    if (!this.enabled) return;

    process.stdout.write('\r\x1b[2K');
  }

  private render(): void {
    process.stdout.write(`\r${pc.cyan(this.frames[this.frameIndex])} ${this.text}`);
  }
}

/** Active spinner reference */
let activeSpinner: Spinner | null = null;

/**
 * When true, stdout is reserved for machine-readable payloads (e.g. `--json`),
 * so all human-facing output (header, warnings, steps, spinner) is routed to stderr.
 */
let jsonMode = false;

/**
 * Enable JSON mode: keep stdout clean for the JSON payload by sending every
 * human-facing line (console.info/console.warn, header, spinner) to stderr.
 * This makes `cella --json ... | jq` pipe cleanly.
 */
export function setJsonMode(enabled: boolean): void {
  jsonMode = enabled;
  if (!enabled) return;
  const toStderr = (...args: unknown[]) => {
    process.stderr.write(`${args.map((a) => (typeof a === 'string' ? a : String(a))).join(' ')}\n`);
  };
  console.info = toStderr;
  console.log = toStderr;
  console.warn = toStderr;
}

/** Whether JSON mode is active. */
export function isJsonMode(): boolean {
  return jsonMode;
}

/** Write a machine-readable payload to stdout (bypasses the stderr routing of JSON mode). */
export function writeStdout(text: string): void {
  process.stdout.write(text.endsWith('\n') ? text : `${text}\n`);
}

/**
 * Get the header line for CLI output.
 */
function getHeader(): string {
  const right = 'cellajs.com';
  // Account for ANSI codes when calculating padding
  const visibleLeft = `⧈ ${NAME} v${VERSION}`;
  const padding = Math.max(1, 60 - visibleLeft.length - right.length);
  return `${pc.cyan(`⧈ ${NAME}`)}${pc.dim(` · v${VERSION}`)}${pc.cyan(`${' '.repeat(padding)}${right}`)}`;
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
 * Print a completed step with checkmark.
 * Optionally include a detail line in grey, followed by a blank line.
 */
function printStep(label: string, detail?: string): void {
  console.info(`${checkMark} ${label}`);
  if (detail) {
    console.info(`  ${pc.dim(detail)}`);
    console.info(); // blank line after detail block
  }
}

/**
 * Create a progress spinner.
 * Uses isSilent in test environments to suppress output.
 */
export function createSpinner(text: string): Spinner {
  const isTestEnv = !!process.env.VITEST || process.env.NODE_ENV === 'test';
  activeSpinner = new TerminalSpinner(text, isTestEnv || jsonMode);
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
 * Show a diff buffer in a terminal pager (bat or less).
 * Blocks until the user exits the pager. Clears screen on return
 * so inquirer re-renders cleanly.
 */
export function showDiffInPager(diffOutput: Buffer): void {
  if (diffOutput.length === 0) return;

  const hasBat = spawnSync('which', ['bat'], { stdio: 'pipe' }).status === 0;

  // Show cursor before handing off to pager
  process.stdout.write('\x1B[?25h');

  if (hasBat) {
    spawnSync('bat', ['--language', 'diff', '--paging', 'always', '--style', 'plain'], {
      input: diffOutput,
      stdio: ['pipe', 'inherit', 'inherit'],
    });
  } else {
    spawnSync('less', ['-R'], {
      input: diffOutput,
      stdio: ['pipe', 'inherit', 'inherit'],
    });
  }

  // Clear screen so inquirer re-renders cleanly after pager exit
  process.stdout.write('\x1B[2J\x1B[0;0H');
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

function quoteShellArg(value: string): string {
  return `'${value.split("'").join("'\\''")}'`;
}

/**
 * Build a VS Code deep link that opens a file from the fork workspace.
 */
function getVsCodeOpenFileLink(filePath: string, options: LinkOptions): string {
  const { forkPath } = options;
  if (!forkPath) return filePath;

  const absolutePath = resolve(forkPath, filePath);
  const url = `vscode://file${absolutePath}`;
  return hyperlink(filePath, url);
}

/** Commit info used for sync progress output */
export interface SyncCommitInfo {
  hash: string;
  message: string;
  date: string;
}

/**
 * Format the fetched-upstream detail block with clickable short commit hashes.
 */
export function formatFetchedUpstreamDetail(
  commitCount: number,
  commits: SyncCommitInfo[],
  upstreamGitHubUrl?: string,
  maxShownCommits = 50,
): string {
  const commitLabel = commitCount === 1 ? '1 new commit' : `${commitCount} new commits`;
  const lines = [`${commitLabel} since last merge`];

  const shown = commits.slice(0, maxShownCommits);
  for (const commit of shown) {
    const shortHash = commit.hash.slice(0, 7);
    const commitUrl = upstreamGitHubUrl ? `${upstreamGitHubUrl}/commit/${commit.hash}` : undefined;
    const hashLabel = hyperlink(shortHash, commitUrl);
    lines.push(`  ${hashLabel} "${commit.message}" (${commit.date})`);
  }

  if (commitCount > shown.length) {
    lines.push(`  ... and ${commitCount - shown.length} more`);
  }

  return lines.join('\n');
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
  const { upstreamGitHubUrl, upstreamBranch, fileLinkMode = 'commit', upstreamViewPath, forkPath } = options;

  if (fileLinkMode === 'local' && upstreamViewPath && forkPath) {
    // Open the upstream version of the file from the auto-managed view worktree.
    const absolutePath = resolve(upstreamViewPath, filePath);
    if (existsSync(absolutePath)) {
      const url = `vscode://file${absolutePath}`;
      return { label: filePath.split('/').pop() || filePath, url };
    }
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

/**
 * Build a copyable `code --diff` command for this file.
 * `command:` URIs only execute inside trusted VS Code markdown/webviews, while
 * terminal OSC 8 links are opened as external URLs and cannot run them.
 */
function getVsCodeDiffLink(filePath: string, options: LinkOptions): string {
  const showTerminalDiffCommands = false;
  // TODO: Re-enable rendered diff commands once we have a terminal UX that is
  // clearly actionable without implying click support that VS Code cannot honor.
  if (!showTerminalDiffCommands) return '';

  const { upstreamViewPath, forkPath } = options;
  if (!upstreamViewPath || !forkPath) return '';

  const upstreamAbsolute = resolve(upstreamViewPath, filePath);
  // Skip the diff link for files absent upstream (e.g. local-only or newly deleted upstream).
  if (!existsSync(upstreamAbsolute)) return '';

  const forkAbsolute = resolve(forkPath, filePath);

  return ` ${pc.dim('·')} ${pc.dim(`code --diff ${quoteShellArg(upstreamAbsolute)} ${quoteShellArg(forkAbsolute)}`)}`;
}

/**
 * Format merge-in-progress detail with conflicts and auto-merged file links.
 */
export function formatMergeInProgressDetail(
  conflictCount: number,
  autoMergedFiles: string[],
  linkOptions: LinkOptions,
  maxFiles = 100,
): string {
  const lines = [`${conflictCount} conflicts to resolve in IDE`];

  if (autoMergedFiles.length === 0) {
    return lines.join('\n');
  }

  lines.push('');
  lines.push(`  auto-merged files (${autoMergedFiles.length}):`);

  const shown = autoMergedFiles.slice(0, maxFiles);
  for (const filePath of shown) {
    const fileLink = getVsCodeOpenFileLink(filePath, linkOptions);
    const diffInfo = getVsCodeDiffLink(filePath, linkOptions);
    lines.push(`  - ${fileLink}${diffInfo}`);
  }

  if (autoMergedFiles.length > shown.length) {
    lines.push(`  ... + ${autoMergedFiles.length - shown.length} more`);
  }

  return lines.join('\n');
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
  local: { icon: pc.green('+'), label: 'local', color: pc.green, description: 'local file' },
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
  printLine('local', summary.local);
  printLine('drifted', summary.drifted);

  console.info();
  printLine('diverged', summary.diverged);
  printLine('pinned', summary.pinned);

  console.info();
  printLine('behind', summary.behind);
}

/**
 * Print a group of files with a specific status, including section header and footer.
 */
function printFileGroup(
  files: AnalyzedFile[],
  status: FileStatus,
  linkOptions: LinkOptions,
  options?: {
    /** Override section header title */
    title?: string;
    /** Footer hint text (dimmed) */
    hint?: string;
    /** Which commit/date fields to use: 'fork' or 'upstream' */
    dateSource?: 'fork' | 'upstream';
  },
): void {
  const filtered = files.filter((f) => f.status === status);
  if (filtered.length === 0) return;

  const config = statusConfig[status];
  const title = options?.title ?? `${config.icon} ${config.label}`;

  printSectionHeader(`${title} ${pc.dim(`· ${filtered.length} files`)}`);

  const useUpstream = options?.dateSource === 'upstream';
  const maxLines = 100;
  const shown = filtered.length > maxLines ? filtered.slice(0, maxLines) : filtered;

  for (const file of shown) {
    const commit = useUpstream ? file.upstreamCommit : file.changedCommit;
    const date = useUpstream ? file.upstreamChangedAt : file.changedAt;
    const dateInfo = formatFileDateInfo(file.path, commit, date, linkOptions);
    const diffInfo = getVsCodeDiffLink(file.path, linkOptions);
    console.info(`  ${config.icon} ${file.path}${dateInfo}${diffInfo}`);
  }

  if (filtered.length > maxLines) {
    console.info(pc.dim(`  ... + ${filtered.length - maxLines} more`));
  }

  if (options?.hint) {
    console.info();
    console.info(pc.dim(`  ${options.hint}`));
  }
}

/**
 * Print files that will sync from upstream.
 */
export function printSyncFiles(files: AnalyzedFile[], linkOptions: LinkOptions): void {
  printFileGroup(files, 'behind', linkOptions, {
    title: pc.cyan('↓ behind on upstream'),
  });
}

/**
 * Print protected fork changes preview for analyze mode.
 * These files differ from upstream but are protected by ignored/pinned config.
 */
export function printAheadPreview(files: AnalyzedFile[], linkOptions: LinkOptions): void {
  printFileGroup(files, 'ahead', linkOptions, {
    title: `${pc.blue('↑ protected in fork')}`,
    hint: 'these files have fork changes and are protected by pinned or ignored config.',
  });
}

/**
 * Print drifted files warning.
 */
export function printDriftedWarning(files: AnalyzedFile[], linkOptions: LinkOptions): void {
  printFileGroup(files, 'drifted', linkOptions, {
    title: `${warningMark} ${pc.yellow('drifted from upstream')}`,
    hint: 'these files have fork changes but are not pinned or ignored.',
  });
}

/**
 * Print diverged files preview for analyze mode.
 * These will be merged by git - some may auto-merge, others may conflict.
 */
export function printDivergedPreview(files: AnalyzedFile[], linkOptions: LinkOptions): void {
  printFileGroup(files, 'diverged', linkOptions, {
    title: `${pc.magenta('⇅ diverged')}`,
    hint: 'both fork and upstream changed.',
    dateSource: 'upstream',
  });
}

/**
 * Print pinned files preview for analyze mode.
 * These files have both fork and upstream changes, but fork changes take precedence.
 */
export function printPinnedPreview(files: AnalyzedFile[], linkOptions: LinkOptions): void {
  printFileGroup(files, 'pinned', linkOptions, {
    title: `${pc.green('⨀ pinned')}`,
    hint: 'both changed, fork wins (pinned in cella.config.ts).',
    dateSource: 'upstream',
  });
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
    // biome-ignore lint/suspicious/noControlCharactersInRegex: stripping ANSI escape sequences requires \x1b literal.
    const icon = config.icon.replace(/\x1b\[[0-9;]*m/g, ''); // Strip ANSI
    lines.push(`  ${icon} ${config.label.padEnd(12)} ${file.path}`);
  }

  writeFileSync(logPath, lines.join('\n'), 'utf-8');
  return logPath;
}

/**
 * Print sync completion message.
 */
export function printSyncComplete(result: MergeResult): void {
  const updated = result.summary.behind + result.summary.diverged;
  const merged = result.autoMergedFiles?.length ?? Math.max(0, result.summary.diverged - result.conflicts.length);
  const conflicts = result.conflicts.length;

  console.info();
  console.info(`${pc.green('✓')} sync complete`);
  console.info(pc.dim(`  ${updated} files updated, ${merged} auto-merged, ${conflicts} conflicts`));

  console.info();
}

/**
 * Print warnings for aggressive sync flags (--hard / --unpinned) after completion.
 *
 * Explains what each active flag did and its consequence, and adds a shared
 * caution to cherry-pick deliberately when either is used.
 */
export function printFlagWarnings(options: { hard?: boolean; unpinned?: boolean }): void {
  const { hard, unpinned } = options;
  if (!hard && !unpinned) return;

  if (hard) {
    console.info(pc.yellow('⚠ --hard used: drifted files were treated as behind, overwriting with incoming.'));
  }
  if (unpinned) {
    console.info(
      pc.yellow('⚠ --unpinned used: pinned files in cella.config.ts were ignored, this can result in more drifts.'),
    );
  }
  console.info(pc.yellow('  Be extra careful & cherrypick what you want only.'));
  console.info();
}
