/**
 * Logging utilities for analyzed file output.
 *
 * Displays per-file sync status during the analyze phase, showing:
 * - File path and sync state (up-to-date, ahead, behind, diverged)
 * - Commit counts (how many commits ahead/behind upstream)
 * - Merge strategy (keep-fork, take-upstream, manual, skip)
 * - Override status (pinned or ignored via cella.config.ts)
 */
import pc from 'picocolors';
import { config } from '#/config';
import type { FileAnalysis } from '#/types';

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
    getStrategyReason(analyzedFile),
  ].filter(Boolean);

  return parts.join(' ').trim();
}

/** Returns the styled file path (relative to repo root). */
function getFilePath(analyzedFile: FileAnalysis): string {
  return pc.white(analyzedFile.filePath);
}

/**
 * Returns the sync state between fork and upstream.
 * - up-to-date: Fork matches upstream (nothing to sync)
 * - ahead: Fork has newer commits than upstream
 * - behind: Upstream has newer commits than fork
 * - diverged: Both sides have changes (potential conflict)
 * - unrelated: No shared commit history
 */
function getGitStatus(analyzedFile: FileAnalysis): string {
  const gitStatus = analyzedFile.commitSummary?.status || 'unknown';

  const statusMap: Record<string, string> = {
    upToDate: `fork: ${pc.bold(pc.green('up to date'))}`,
    ahead: `fork: ${pc.bold(pc.blue('ahead'))}`,
    behind: `fork: ${pc.bold(pc.yellow('behind'))}`,
    diverged: `fork: ${pc.bold(pc.red('diverged'))}`,
    unrelated: `fork: ${pc.bold(pc.magenta('unrelated'))}`,
  };

  return statusMap[gitStatus] || `fork: ${pc.bold(pc.red('unknown state'))}`;
}

/**
 * Returns the commit count difference between fork and upstream.
 * Shows arrows: ↑ = commits ahead, ↓ = commits behind.
 */
function getCommitState(analyzedFile: FileAnalysis): string {
  const commitsAhead = analyzedFile.commitSummary?.commitsAhead || 0;
  const commitsBehind = analyzedFile.commitSummary?.commitsBehind || 0;

  if (commitsAhead > 0 && commitsBehind > 0) {
    return pc.bold(`(↑ ${pc.blue(commitsAhead)} ↓ ${pc.yellow(commitsBehind)})`);
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
  return pc.dim(`Last in sync: ${date.toLocaleDateString()}`);
}

/**
 * Returns the merge strategy badge.
 * Strategies: keep-fork, take-upstream, skip (ignored), manual (needs resolution).
 */
function getStrategyFlag(analyzedFile: FileAnalysis): string {
  const mergeStrategy = analyzedFile.mergeStrategy;
  if (!mergeStrategy) return pc.bgRed(pc.black(' No Strategy '));
  if (mergeStrategy.strategy === 'unknown') return pc.bgRed(pc.black(`${mergeStrategy.strategy} `));
  if (mergeStrategy.strategy === 'manual') return pc.bgYellow(pc.black(` ${mergeStrategy.strategy} `));
  return pc.green(pc.black(` ${mergeStrategy.strategy} `));
}

/**
 * Returns the reason for the chosen merge strategy.
 * Examples: "pinned in config", "content identical", "fork ahead", "both sides changed".
 */
function getStrategyReason(analyzedFile: FileAnalysis): string {
  const mergeStrategy = analyzedFile.mergeStrategy;
  if (!mergeStrategy) return '';
  if (mergeStrategy.strategy === 'unknown') return pc.red(`→ ${mergeStrategy.reason}`);
  if (mergeStrategy.strategy === 'manual') return pc.yellow(`→ ${mergeStrategy.reason}`);
  return pc.green(`→ ${mergeStrategy.reason}`);
}

/**
 * Determines if the file analysis module should display output.
 * Only shown in verbose or debug mode (controlled via --verbose or --debug flags).
 */
export function shouldLogAnalyzedFileModule(): boolean {
  return config.debug || config.verbose;
}

/**
 * Logs the analyzed file line with smart filtering.
 *
 * Filtering logic:
 * - Always skip files with identical content (nothing to sync)
 * - In verbose/debug mode: show all non-identical files
 * - Default mode: only show files needing attention (diverged, behind, manual, unknown)
 */
export function logAnalyzedFileLine(analyzedFile: FileAnalysis, line: string): void {
  const status = analyzedFile.commitSummary?.status;
  const strategy = analyzedFile.mergeStrategy?.strategy;
  const reason = analyzedFile.mergeStrategy?.reason || '';

  // Skip files with identical content - trivial keep-fork cases, not useful to show
  const isIdentical = reason.includes('identical');
  if (isIdentical) return;

  // In verbose/debug mode, log everything except identical files
  if (config.debug || config.verbose) {
    console.info(line);
    return;
  }

  // Default: only log files needing attention (diverged, behind, manual, unknown)
  const needsAttention =
    status === 'diverged' || status === 'behind' || strategy === 'manual' || strategy === 'unknown';

  if (needsAttention) {
    console.info(line);
  }
}
