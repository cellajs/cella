/**
 * Logging utilities for analyzed file output.
 *
 * Displays per-file sync status during the analyze phase, showing:
 * - File path and sync state (up-to-date, ahead, behind, diverged)
 * - Commit counts (how many commits ahead/behind upstream)
 * - Merge strategy (keep-fork, take-upstream, manual, skip)
 * - Override status (pinned or ignored via cella.config.ts)
 *
 * Console output is filtered to show only files needing attention.
 * Use --log flag to write full analysis to cella-sync.{timestamp}.log.
 */
import { appendFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import pc from 'picocolors';
import { config } from '#/config';
import { type GitStatus, getDisplayLabel, STATUS_CONFIG } from '#/constants/status';
import type { FileAnalysis } from '#/types';

// ─────────────────────────────────────────────────────────────────────────────
// Log File Support
// ─────────────────────────────────────────────────────────────────────────────

/** Generates a timestamped log filename */
function getLogFileName(): string {
  const now = new Date();
  const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
  return `cella-sync.${timestamp}.log`;
}

/** Current log file path (set when --log flag is used) */
let logFilePath: string | null = null;

/**
 * Initializes the log file for writing full analysis output.
 * Called at the start of file analysis when --log flag is used.
 */
export function initLogFile(): void {
  if (!config.logFile) return;

  const fileName = getLogFileName();
  logFilePath = join(config.workingDirectory, fileName);

  const header = `Cella Sync Analysis Log\nGenerated: ${new Date().toISOString()}\n${'─'.repeat(60)}\n\n`;
  writeFileSync(logFilePath, header);
  console.info(pc.dim(`Writing full analysis to ${fileName}`));
}

/**
 * Writes a line to the log file (strips ANSI colors).
 */
function writeToLogFile(line: string): void {
  if (!logFilePath) return;

  // Strip ANSI color codes for log file
  const plainLine = line.replace(/\x1b\[[0-9;]*m/g, '');
  appendFileSync(logFilePath, plainLine + '\n');
}

/**
 * Finalizes the log file and reports location to user.
 */
export function finalizeLogFile(): void {
  if (!logFilePath) return;

  appendFileSync(logFilePath, `\n${'─'.repeat(60)}\nEnd of analysis\n`);
  console.info(pc.green(`✓ Full analysis written to ${logFilePath}`));
}

// ─────────────────────────────────────────────────────────────────────────────
// Line Formatting
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Creates a formatted log line for an analyzed file.
 * Combines all file analysis information into a single readable line.
 */
export function analyzedFileLine(analyzedFile: FileAnalysis): string {
  const parts: string[] = [
    getFilePath(analyzedFile),
    getGitStatus(analyzedFile),
    getCommitState(analyzedFile),
    getCommitSha(analyzedFile),
    getLastSyncedAt(analyzedFile),
    getStrategyFlag(analyzedFile),
    // getStrategyReason(analyzedFile),
  ].filter(Boolean);

  return parts.join(' ').trim();
}

/** Returns the styled file path (relative to repo root). */
function getFilePath(analyzedFile: FileAnalysis): string {
  return pc.white(analyzedFile.filePath);
}

/**
 * Returns the sync state between fork and upstream.
 * Uses shared status config for consistent labeling across file and summary output.
 */
function getGitStatus(analyzedFile: FileAnalysis): string {
  const gitStatus = (analyzedFile.commitSummary?.status || 'unknown') as GitStatus;
  const isPinned = analyzedFile.overrideStatus === 'pinned';
  const isIgnored = analyzedFile.overrideStatus === 'ignored';
  const overrideStatus = isPinned ? 'pinned' : isIgnored ? 'ignored' : 'none';

  const displayLabel = getDisplayLabel(gitStatus, overrideStatus);
  const { colorFn } = STATUS_CONFIG[displayLabel];

  return ` ${pc.bold(colorFn(displayLabel))}`;
}

/**
 * Returns the commit count difference between fork and upstream.
 * Shows arrows: ↑ = commits ahead, ⇅ = diverged, ↓ = commits behind.
 */
function getCommitState(analyzedFile: FileAnalysis): string {
  const commitsAhead = analyzedFile.commitSummary?.commitsAhead || 0;
  const commitsBehind = analyzedFile.commitSummary?.commitsBehind || 0;

  if (commitsAhead > 0 && commitsBehind > 0) {
    return pc.bold(`↑${pc.blue(commitsAhead)}  ↓${pc.yellow(commitsBehind)}`);
  }
  if (commitsAhead > 0) return pc.bold(`↑ ${pc.blue(commitsAhead)}`);
  if (commitsBehind > 0) return pc.bold(`↓ ${pc.yellow(commitsBehind)}`);
  return '';
}

/**
 * Returns short commit SHAs showing the transition.
 * Format: (forkSha → upstreamSha) when different, or just (sha) when same.
 */
function getCommitSha(analyzedFile: FileAnalysis): string {
  const forkSha = analyzedFile.forkFile?.shortCommitSha;
  const upstreamSha = analyzedFile.upstreamFile?.shortCommitSha;

  if (forkSha && upstreamSha) {
    return forkSha === upstreamSha ? `(${forkSha})` : `(${forkSha} → ${upstreamSha})`;
  }
  return `${forkSha || upstreamSha}`;
}

/**
 * Returns when the file was last in sync (merge-base date).
 * Shows ✔ if currently up-to-date, or the date of last sync if behind/diverged.
 * Helps understand how stale the file is relative to upstream.
 */
function getLastSyncedAt(analyzedFile: FileAnalysis): string {
  const lastSync = analyzedFile.commitSummary?.lastSyncedAt;
  if (!lastSync) return '';
  if (analyzedFile.commitSummary?.status === 'upToDate') return pc.dim('✔');

  const date = new Date(lastSync);
  return pc.dim(` ≠ ${date.toLocaleDateString()}`);
}

/**
 * Returns the merge strategy badge.
 * Strategies: keep-fork, take-upstream, skip (ignored), manual (needs resolution).
 */
function getStrategyFlag(analyzedFile: FileAnalysis): string {
  const mergeStrategy = analyzedFile.mergeStrategy;
  if (!mergeStrategy) return pc.bgRed(pc.black('no strategy '));
  if (mergeStrategy.strategy === 'unknown') return pc.bgRed(pc.black(`${mergeStrategy.strategy} `));
  if (mergeStrategy.strategy === 'manual') return pc.bgYellow(pc.black(` ${mergeStrategy.strategy} `));
  return pc.green(pc.black(` ${mergeStrategy.strategy} `));
}

/**
 * Returns the reason for the chosen merge strategy.
 * Examples: "pinned in config", "content identical", "fork ahead", "both sides changed".
 */
// function getStrategyReason(analyzedFile: FileAnalysis): string {
//   const mergeStrategy = analyzedFile.mergeStrategy;
//   if (!mergeStrategy) return '';
//   if (mergeStrategy.strategy === 'unknown') return pc.red(`→ ${mergeStrategy.reason}`);
//   if (mergeStrategy.strategy === 'manual') return pc.yellow(`→ ${mergeStrategy.reason}`);
//   return pc.green(`→ ${mergeStrategy.reason}`);
// }

// ─────────────────────────────────────────────────────────────────────────────
// Console Output Filtering
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Determines if the file analysis module should display output.
 * Only shown in verbose or debug mode (controlled via --verbose or --debug flags).
 */
export function shouldLogAnalyzedFileModule(): boolean {
  return config.debug || config.verbose;
}

/**
 * Determines if a file should be shown in console output.
 *
 * Console filtering (files needing attention):
 * - Skip: ignored files (flagged in cella.config.ts)
 * - Skip: up-to-date files (nothing to sync)
 * - Skip: files with identical content
 * - Skip: ahead + pinned files (protected, no action needed)
 * - Show: ahead + unpinned files (at risk - may want to pin)
 * - Show: behind, diverged, manual, unknown (require attention)
 */
function shouldShowInConsole(analyzedFile: FileAnalysis): boolean {
  const status = analyzedFile.commitSummary?.status;
  const reason = analyzedFile.mergeStrategy?.reason || '';
  const isPinned = analyzedFile.overrideStatus === 'pinned';
  const isIgnored = analyzedFile.overrideStatus === 'ignored';

  // Never show ignored files in console
  if (isIgnored) return false;

  // Never show up-to-date files
  if (status === 'upToDate') return false;

  // Never show files with identical content
  if (reason.includes('identical')) return false;

  // Ahead + pinned = protected, no action needed
  if (status === 'ahead' && isPinned) return false;

  // Show ahead + unpinned (at risk), behind, diverged, manual, unknown
  return true;
}

/**
 * Logs the analyzed file line with smart filtering.
 *
 * Console: Only files needing attention (ahead+unpinned, behind, diverged, manual, unknown)
 * Log file: All files (when --log flag is used)
 */
export function logAnalyzedFileLine(analyzedFile: FileAnalysis, line: string): void {
  // Always write to log file if enabled (includes all files)
  if (config.logFile) {
    writeToLogFile(line);
  }

  // In verbose/debug mode, show more files but still filter ignored/up-to-date
  if (config.debug || config.verbose) {
    if (analyzedFile.overrideStatus !== 'ignored' && analyzedFile.commitSummary?.status !== 'upToDate') {
      const reason = analyzedFile.mergeStrategy?.reason || '';
      if (!reason.includes('identical')) {
        console.info(line);
      }
    }
    return;
  }

  // Default: only show files needing attention
  if (shouldShowInConsole(analyzedFile)) {
    console.info(line);
  }
}
