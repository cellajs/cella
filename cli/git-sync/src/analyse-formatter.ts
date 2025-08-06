import pc from "picocolors";
import { AutoResolvable, BlobComparisonStatus, ConflictLikelihood, ConflictReason, FileSyncState, ResolutionReason, type FileSyncAnalysis } from './file-sync-analysis';
import { LogConfig } from "./config";

const glyphs: Record<string, string> = {
  upToDate: pc.green('✔'),        // check mark
  missing: pc.red('✗'),           // cross mark
  ahead: pc.green('⇧'),           // up arrow
  behind: pc.yellow('↓'),         // down arrow
  diverged: pc.magenta('⇔'),      // left-right arrow
  unrelated: pc.gray('⊗'),         // circled times
  outdated: pc.yellow('…'),       // ellipsis
  // ignored: pc.dim('⧉'),          // dimmed symbol
};

/**
 * Formats an array of file sync analysis objects into strings
 * with colors and icons for logging or display.
 * 
 * @param analyses - Array of FileSyncAnalysis objects to format
 * @returns An array of formatted log strings, one per file analysis
 */
export function formatAnalysisLogs(analysis: FileSyncAnalysis): string {
  const syncStateIcon = formatSyncStateIcon(analysis);
  const filePath = formatFilePath(analysis);
  const syncStateText = formatSyncStateText(analysis);
  const commitsAheadBehind = formatCommitsAheadBehind(analysis);
  const commitSha = formatCommitSha(analysis);
  const lastSyncedInfo = formatLastSyncedDate(analysis);
  const conflictTag = formatConflictTag(analysis);
  const conflictResolutionReason = formatConflictResolutionReason(analysis);

  const textParts = [
    syncStateIcon,
    filePath,
    syncStateText
  ];

  if (commitsAheadBehind) {
    textParts.push(commitsAheadBehind);
  }
  if (commitSha) {
    textParts.push(commitSha);
  }
  if (lastSyncedInfo) {
    textParts.push(lastSyncedInfo);
  }
  if (conflictTag) {
    textParts.push(conflictTag);
  }

  if (conflictResolutionReason) {
    textParts.push(conflictResolutionReason);
  }

  return textParts.join(' ').trim();
}

/**
 * Returns the colored icon representing the sync state of the file.
 * 
 * @param analysis - FileSyncAnalysis object
 * @returns Colored icon string or empty string if unknown
 */
function formatSyncStateIcon(analysis: FileSyncAnalysis): string {
  const stateKey = analysis.conflictAnalysis.syncState.toString();
  return glyphs[stateKey] ?? '';
}

/**
 * Returns the colored file path string.
 * 
 * @param analysis - FileSyncAnalysis object
 * @returns Colored file path
 */
function formatFilePath(analysis: FileSyncAnalysis): string {
  return pc.white(analysis.filePath);
}

/**
 * Returns a formatted string describing the sync state of the fork.
 * 
 * @param analysis - FileSyncAnalysis object
 * @returns Formatted sync state text
 */
function formatSyncStateText(analysis: FileSyncAnalysis): string {
  const syncState = analysis.conflictAnalysis.syncState;
  switch (syncState) {
    case FileSyncState.UpToDate:
      return pc.green("Fork is up to date");
    case FileSyncState.Missing:
      return pc.red("Fork is missing");
    case FileSyncState.Ahead:
      return pc.green("Fork is ahead");
    case FileSyncState.Behind:
      return pc.yellow("Fork is behind");
    case FileSyncState.Diverged:
      return pc.magenta("Fork has diverged");
    case FileSyncState.Unrelated:
      return pc.gray("Fork is unrelated");
    case FileSyncState.Outdated:
      return pc.yellow("Fork is outdated");
    default:
      return pc.dim("Fork state unknown");
  }
}

/**
 * Returns a formatted string showing commits ahead/behind if applicable.
 * 
 * @param analysis - FileSyncAnalysis object
 * @returns Formatted commits ahead/behind string or empty string
 */
function formatCommitsAheadBehind(analysis: FileSyncAnalysis): string {
  const commitsAhead = analysis.commitComparison?.commitsAhead ?? 0;
  const commitsBehind = analysis.commitComparison?.commitsBehind ?? 0;
  if (commitsAhead > 0 && commitsBehind > 0) {
    return `(↑ ${pc.green(commitsAhead)} ↓ ${pc.yellow(commitsBehind)})`;
  }
  if (commitsAhead > 0) {
    return `(↑ ${pc.green(commitsAhead)})`;
  }
  if (commitsBehind > 0) {
    return `(↓ ${pc.yellow(commitsBehind)})`;
  }
  return '';
}

/**
 * Returns the colored boilerplate and fork commit short SHA string, or empty if fork file missing.
 * 
 * @param analysis - FileSyncAnalysis object
 * @returns Colored commit SHA string or empty string
 */
function formatCommitSha(analysis: FileSyncAnalysis): string {
  const syncState = analysis.conflictAnalysis.syncState;
  const forkSha = analysis.forkedFile?.shortCommitSha;
  const boilerSha = analysis.boilerplateFile?.shortCommitSha;

  switch (syncState) {
    case FileSyncState.UpToDate:
      return `(${pc.green(boilerSha)})`;
    case FileSyncState.Missing:
      return `(${pc.red(boilerSha)})`;
    case FileSyncState.Ahead:
      return `(${pc.green(forkSha)} → ${pc.white(boilerSha)})`;;
    case FileSyncState.Behind:
      return `(${pc.red(forkSha)} → ${pc.white(boilerSha)})`;;
    case FileSyncState.Outdated:
      return `(${pc.red(forkSha)} → ${pc.white(boilerSha)})`;;
    case FileSyncState.Diverged:
    case FileSyncState.Unrelated:
    default:
      return `(${pc.red(forkSha)} ≠ ${pc.red(boilerSha)})`;;
  }
}

/**
 * Returns a formatted string showing the last sync date if available.
 * 
 * @param analysis - FileSyncAnalysis object
 * @returns Formatted last sync date string or empty string
 */
function formatLastSyncedDate(analysis: FileSyncAnalysis): string {
  const lastSyncedAt = analysis.commitComparison?.lastSyncedAt;
  if (!lastSyncedAt) return '';

  const syncState = analysis.conflictAnalysis.syncState;
  const formattedDate = new Date(lastSyncedAt).toLocaleDateString();

  switch (syncState) {
    case FileSyncState.Ahead:
    case FileSyncState.Behind:
    case FileSyncState.Outdated:
    case FileSyncState.Diverged:
      return ` (last in sync: ${pc.gray(formattedDate)})`;
    case FileSyncState.UpToDate:
    case FileSyncState.Missing:
    case FileSyncState.Unrelated:
      return '';
  }
}

/**
 * Returns a formatted conflict tag based on the conflict likelihood.
 * 
 * @param analysis - FileSyncAnalysis object
 * @returns Formatted conflict tag string or empty string
 */
function formatConflictTag(analysis: FileSyncAnalysis): string {
  if (analysis.conflictAnalysis.conflictLikelihood === ConflictLikelihood.Low) {
    return '';
  }
  if (analysis.conflictAnalysis.conflictLikelihood === ConflictLikelihood.Medium) {
    if (analysis.conflictAnalysis.autoResolvable === AutoResolvable.Git) {
      return pc.yellowBright(' Conflict ');
    }
    return pc.bgYellow(pc.black(' Conflict '));
  }

  // High likelihood conflicts
  if (analysis.conflictAnalysis.autoResolvable === AutoResolvable.Git) {
    return pc.redBright(' Conflict ');
  }
  return pc.bgRed(pc.black(' Conflict '));
}

/**
 * Returns a formatted conflict resolution reason based on the analysis.
 * 
 * @param analysis - FileSyncAnalysis object
 * @returns Formatted conflict resolution reason string or empty string
 */
function formatConflictResolutionReason(analysis: FileSyncAnalysis): string {
  if (analysis.conflictAnalysis.conflictLikelihood === ConflictLikelihood.Low) {
    return '';
  }
  if (analysis.conflictAnalysis.autoResolvable === AutoResolvable.Git) {
    return formatConflictResolutionReasonByGit(analysis);
  } 
  return formatConflictResolutionReasonManual(analysis);
}

/**
 * Formats the conflict resolution reason when auto-resolvable by Git.
 * 
 * @param analysis - FileSyncAnalysis object
 * @returns Formatted resolution reason string
 */
function formatConflictResolutionReasonByGit(analysis: FileSyncAnalysis): string {
  const resolutionReasonText = ['→ Auto-resolvable by Git']

  if (analysis.conflictAnalysis.resolutionReason === ResolutionReason.ForkHasNewerCommits) {
    resolutionReasonText.push(': Add new commits from fork');
  }
  if (analysis.conflictAnalysis.resolutionReason === ResolutionReason.BoilerplateHasNewerCommits) {
    resolutionReasonText.push(': Add new commits from boilerplate');
  }
  if (analysis.conflictAnalysis.blobStatus === BlobComparisonStatus.Identical) {
    resolutionReasonText.push(': File content is identical');
  }

  return pc.dim(resolutionReasonText.join(' '));
}

/**
 * Formats the conflict resolution reason when manual resolution is required.
 * 
 * @param analysis - FileSyncAnalysis object
 * @returns Formatted resolution reason string
 */
function formatConflictResolutionReasonManual(analysis: FileSyncAnalysis): string {
  const resolutionReasonText = ['→ Manual resolution required'];

  if (analysis.conflictAnalysis.conflictReason === ConflictReason.MissingInFork) {
    resolutionReasonText.push(': Should be choose to add missing file');
  }
  if ([ConflictReason.BlobMismatch, ConflictReason.OutdatedInFork].includes(analysis.conflictAnalysis.conflictReason) ) {
    resolutionReasonText.push(': Something is wrong with the file content');
  }
  if (analysis.conflictAnalysis.conflictReason === ConflictReason.UnrelatedHistories) {
    resolutionReasonText.push(': Add history from boilerplate');
  }
  if (analysis.conflictAnalysis.conflictReason === ConflictReason.DivergedHistories) {
    resolutionReasonText.push(': Resolve diverged histories');
  }

  return pc.red(resolutionReasonText.join(' '));
}