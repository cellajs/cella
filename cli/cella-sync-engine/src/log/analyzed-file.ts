import pc from "picocolors";

import { FileAnalysis } from "../types";
import { config } from "../config";

/**
 * Creates a log line for an analyzed file.
 * 
 * @param analyzedFile - The analyzed file object.
 * 
 * @returns The log line string.
 */
export function analyzedFileLine(analyzedFile: FileAnalysis): string {
  // Default status icon for a file
  const status = '🗎';

  // Gather various pieces of information about the analyzed file (styled for console output)
  const filePath = getFilePath(analyzedFile);
  const gitStatus = getGitStatus(analyzedFile);
  const commitState = getCommitState(analyzedFile);
  const commitSha = getCommitSha(analyzedFile);
  const lastSyncedAt = getLastSyncedAt(analyzedFile);
  const strategyFlag = getStrategyFlag(analyzedFile);
  const strategyReason = getStrategyReason(analyzedFile);

  // Combine all parts into a single log line, just filtering out any empty strings
  const parts: string[] = [
    status,
    filePath,
    gitStatus,
    commitState,
    commitSha,
    lastSyncedAt,
    strategyFlag,
    strategyReason,
  ].filter(Boolean);

  // Join parts with spaces and return the final log line
  return parts.join(' ').trim();
}

/**
 * Returns the file path of the analyzed file, styled for console output.
 * 
 * @param analyzedFile - The analyzed file object.
 * 
 * @returns The styled file path string.
 */
function getFilePath(analyzedFile: FileAnalysis): string {
  const filePath = analyzedFile.filePath;
  return pc.white(filePath);
}

/**
 * Returns the git status of the analyzed file, styled for console output.
 * @param analyzedFile - The analyzed file object.
 * 
 * @returns The styled git status string.
 */
function getGitStatus(analyzedFile: FileAnalysis): string {
  const gitStatus = analyzedFile.commitSummary?.status || 'unknown';

  if (gitStatus === 'upToDate') {
    return `fork: ${pc.bold(pc.green('Up to date'))}`
  }

  if (gitStatus === 'ahead') {
    return `fork: ${pc.bold(pc.green('Ahead'))}`;
  }

  if (gitStatus === 'behind') {
    return `fork: ${pc.bold(pc.yellow('Behind'))}`;
  }

  if (gitStatus === 'diverged') {
    return `fork: ${pc.bold(pc.red('Diverged'))}`;
  }

  if (gitStatus === 'unrelated') {
    return `fork: ${pc.bold(pc.red('Unrelated'))}`;
  }

  return `fork: ${pc.bold(pc.red('Unknown state'))}`;
}

/**
 * Returns the commit state of the analyzed file, styled for console output.
 * 
 * @param analyzedFile - The analyzed file object.
 * 
 * @returns The styled commit state string.
 */
function getCommitState(analyzedFile: FileAnalysis): string {
  const commitsAhead = analyzedFile.commitSummary?.commitsAhead || 0;
  const commitsBehind = analyzedFile.commitSummary?.commitsBehind || 0;

  // Both ahead and behind (diverged)
  if (commitsAhead > 0 && commitsBehind > 0) {
    return pc.bold(`(↑ ${pc.green(commitsAhead)} ↓ ${pc.yellow(commitsBehind)})`);
  }

  // Only ahead
  if (commitsAhead > 0) {
    return pc.bold(`↑ ${pc.green(commitsAhead)}`);
  }

  // Only behind
  if (commitsBehind > 0) {
    return pc.bold(`↓ ${pc.yellow(commitsBehind)}`);
  }

  return '';
}

/**
 * Returns the commit SHA information of the analyzed file, styled for console output.
 * 
 * @param analyzedFile - The analyzed file object.
 * 
 * @returns The styled commit SHA string.
 */
function getCommitSha(analyzedFile: FileAnalysis): string {
  const forkSha = analyzedFile.forkFile?.shortCommitSha;
  const boilerSha = analyzedFile.boilerplateFile?.shortCommitSha;

  // Both SHAs exist
  if (forkSha && boilerSha) {
    // Same SHAs → return fork SHA only
    if (forkSha === boilerSha) {
      return `(${forkSha})`;
    }

    // Different SHAs → return both
    return `(${forkSha} → ${boilerSha})`;
  }

  // Only one (or none) exists
  return `${forkSha || boilerSha}`;
}

/**
 * Returns the last synced date of the analyzed file, styled for console output.
 * 
 * @param analyzedFile - The analyzed file object.
 * 
 * @returns The styled last synced date string.
 */
function getLastSyncedAt(analyzedFile: FileAnalysis): string {
  const lastSync = analyzedFile.commitSummary?.lastSyncedAt;

  // No last sync date
  if (!lastSync) {
    return '';
  }

  // File is up to date
  if (analyzedFile.commitSummary?.status === 'upToDate') {
    return pc.dim('✔');
  }

  // Format and return the last sync date
  const date = new Date(lastSync);
  return pc.dim(`Last in sync: ${date.toLocaleDateString()}`);
}

/**
 * Returns the merge strategy flag of the analyzed file, styled for console output.
 * 
 * @param analyzedFile - The analyzed file object.
 * 
 * @returns The styled merge strategy flag string.
 */
function getStrategyFlag(analyzedFile: FileAnalysis): string {
  const mergeStrategy = analyzedFile.mergeStrategy;

  if (!mergeStrategy) {
    return pc.bgRed(pc.black(' No Strategy '));
  }

  if (mergeStrategy.strategy === 'unknown') {
    return pc.bgRed(pc.black(`${mergeStrategy.strategy} `));
  }

  if (mergeStrategy.strategy === 'manual') {
    return pc.bgYellow(pc.black(` ${mergeStrategy.strategy} `));
  }

  return pc.green(pc.black(` ${mergeStrategy.strategy} `));
}

/**
 * Returns the reason for the merge strategy of the analyzed file, styled for console output.
 * 
 * @param analyzedFile - The analyzed file object.
 * 
 * @returns The styled merge strategy reason string.
 */
function getStrategyReason(analyzedFile: FileAnalysis): string {
  const mergeStrategy = analyzedFile.mergeStrategy;

  if (!mergeStrategy) {
    return '';
  }

  if (mergeStrategy.strategy === 'unknown') {
    return pc.red(`→ ${mergeStrategy.reason}`);
  }

  if (mergeStrategy.strategy === 'manual') {
    return pc.yellow(`→ ${mergeStrategy.reason}`);
  }

  return pc.green(`→ ${mergeStrategy.reason}`);
}

/**
 * Checks if the analyzed file module should be logged based on the configuration.
 * 
 * @returns Whether the analyzed file module should be logged.
 */
export function shouldLogAnalyzedFileModule(): boolean {
  const logModulesConfigured = 'modules' in config.log;

  // If no specific modules are configured, log by default
  if (!logModulesConfigured) {
    return true;
  }

  return config.log.modules?.includes('analyzedFile') || false;
}

/**
 * Will log the analyzed file line based on the configuration.
 * 
 * @param analyzedFile - The analyzed file object.
 * @param line The line to be logged.
 * 
 * @returns void
 */
export function logAnalyzedFileLine(analyzedFile: FileAnalysis, line: string): void {
  // If commit summary state (filter) is configured, check if it matches the analyzed file's state
  const commitSummaryStateConfigured = 'commitSummaryState' in config.log.analyzedFile;
  const commitSummaryStateEqual = config.log.analyzedFile.commitSummaryState?.includes(analyzedFile.commitSummary?.status || 'unknown');

  // If file path (filter) is configured, check if it matches the analyzed file's path
  const filePathConfigured = 'filePath' in config.log.analyzedFile;
  const filePathEqual = config.log.analyzedFile.filePath?.includes(analyzedFile.filePath);

  // If merge strategy (filter) is configured, check if it matches the analyzed file's strategy
  const mergeStrategyConfigured = 'mergeStrategyStrategy' in config.log.analyzedFile;
  const mergeStrategyEqual = config.log.analyzedFile.mergeStrategyStrategy?.includes(analyzedFile.mergeStrategy?.strategy || 'unknown');

  // Determine if the line should be logged based on all conditions
  const shouldLog = [
    shouldLogAnalyzedFileModule(),
    !commitSummaryStateConfigured || commitSummaryStateEqual,
    !filePathConfigured || filePathEqual,
    !mergeStrategyConfigured || mergeStrategyEqual,
  ].every(Boolean);

  if (shouldLog) {
    console.info(line);
  }
}
