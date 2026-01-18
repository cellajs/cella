/**
 * Logging utilities for analyzed file output.
 */
import pc from 'picocolors';
import { config } from '#/config';
import type { FileAnalysis } from '#/types';

/**
 * Creates a log line for an analyzed file.
 */
export function analyzedFileLine(analyzedFile: FileAnalysis): string {
  const status = '🗎';
  const parts: string[] = [
    status,
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

/** Returns the styled file path. */
function getFilePath(analyzedFile: FileAnalysis): string {
  return pc.white(analyzedFile.filePath);
}

/** Returns the git status styled for console output. */
function getGitStatus(analyzedFile: FileAnalysis): string {
  const gitStatus = analyzedFile.commitSummary?.status || 'unknown';

  const statusMap: Record<string, string> = {
    upToDate: `fork: ${pc.bold(pc.green('up to date'))}`,
    ahead: `fork: ${pc.bold(pc.green('ahead'))}`,
    behind: `fork: ${pc.bold(pc.yellow('behind'))}`,
    diverged: `fork: ${pc.bold(pc.red('diverged'))}`,
    unrelated: `fork: ${pc.bold(pc.red('unrelated'))}`,
  };

  return statusMap[gitStatus] || `fork: ${pc.bold(pc.red('unknown state'))}`;
}

/** Returns the commit state (ahead/behind counts). */
function getCommitState(analyzedFile: FileAnalysis): string {
  const commitsAhead = analyzedFile.commitSummary?.commitsAhead || 0;
  const commitsBehind = analyzedFile.commitSummary?.commitsBehind || 0;

  if (commitsAhead > 0 && commitsBehind > 0) {
    return pc.bold(`(↑ ${pc.green(commitsAhead)} ↓ ${pc.yellow(commitsBehind)})`);
  }
  if (commitsAhead > 0) return pc.bold(`↑ ${pc.green(commitsAhead)}`);
  if (commitsBehind > 0) return pc.bold(`↓ ${pc.yellow(commitsBehind)}`);
  return '';
}

/** Returns the commit SHA information. */
function getCommitSha(analyzedFile: FileAnalysis): string {
  const forkSha = analyzedFile.forkFile?.shortCommitSha;
  const upstreamSha = analyzedFile.upstreamFile?.shortCommitSha;

  if (forkSha && upstreamSha) {
    return forkSha === upstreamSha ? `(${forkSha})` : `(${forkSha} → ${upstreamSha})`;
  }
  return `${forkSha || upstreamSha}`;
}

/** Returns the last synced date. */
function getLastSyncedAt(analyzedFile: FileAnalysis): string {
  const lastSync = analyzedFile.commitSummary?.lastSyncedAt;
  if (!lastSync) return '';
  if (analyzedFile.commitSummary?.status === 'upToDate') return pc.dim('✔');

  const date = new Date(lastSync);
  return pc.dim(`Last in sync: ${date.toLocaleDateString()}`);
}

/** Returns the merge strategy flag. */
function getStrategyFlag(analyzedFile: FileAnalysis): string {
  const mergeStrategy = analyzedFile.mergeStrategy;
  if (!mergeStrategy) return pc.bgRed(pc.black(' No Strategy '));
  if (mergeStrategy.strategy === 'unknown') return pc.bgRed(pc.black(`${mergeStrategy.strategy} `));
  if (mergeStrategy.strategy === 'manual') return pc.bgYellow(pc.black(` ${mergeStrategy.strategy} `));
  return pc.green(pc.black(` ${mergeStrategy.strategy} `));
}

/** Returns the merge strategy reason. */
function getStrategyReason(analyzedFile: FileAnalysis): string {
  const mergeStrategy = analyzedFile.mergeStrategy;
  if (!mergeStrategy) return '';
  if (mergeStrategy.strategy === 'unknown') return pc.red(`→ ${mergeStrategy.reason}`);
  if (mergeStrategy.strategy === 'manual') return pc.yellow(`→ ${mergeStrategy.reason}`);
  return pc.green(`→ ${mergeStrategy.reason}`);
}

/** Checks if the analyzed file module should be logged based on configuration. */
export function shouldLogAnalyzedFileModule(): boolean {
  return config.debug || config.verbose;
}

/** Logs the analyzed file line based on configuration filters. */
export function logAnalyzedFileLine(analyzedFile: FileAnalysis, line: string): void {
  const status = analyzedFile.commitSummary?.status;
  const strategy = analyzedFile.mergeStrategy?.strategy;
  const reason = analyzedFile.mergeStrategy?.reason || '';

  // Skip files that are identical (trivial keep-fork cases) - not useful to show
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
