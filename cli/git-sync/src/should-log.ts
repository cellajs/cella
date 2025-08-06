import { logConfig } from "./config";
import { AutoResolvable, ConflictLikelihood, FileSyncAnalysis, FileSyncState } from "./file-sync-analysis";

/**
 * Determines whether a file should be included in the log output
 * based on the current logging mode in `logConfig`.
 * 
 * @param file - The FileSyncAnalysis object representing the file.
 * @returns {boolean} - True if the file should be logged, false otherwise.
 */
export function shouldLogFile(file: FileSyncAnalysis): boolean {
  const { mode } = logConfig;

  if (mode === 'full') return true;
  if (mode === 'summaryOnly') return false;

  if (mode === 'relevantOnly') {
    const { syncState, conflictLikelihood } = file.conflictAnalysis;
    const isInterestingState = syncState !== FileSyncState.UpToDate;
    const hasConflictRisk = conflictLikelihood >= ConflictLikelihood.Medium;
    return isInterestingState || hasConflictRisk;
  }

  if (mode === 'conflictsOnly') {
    return file.conflictAnalysis.conflictLikelihood >= ConflictLikelihood.Medium && file.conflictAnalysis.autoResolvable === AutoResolvable.None;
  }

  return true;
}

/**
 * Determines whether to log the summary based on the current logging mode.
 * 
 * @returns {boolean} - True if summary should be logged, false otherwise.
 */
export function shouldLogSummary(): boolean {
  return true; // Always log summary for now
}