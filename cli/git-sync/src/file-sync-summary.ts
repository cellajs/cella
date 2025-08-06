import { AutoResolvable, ConflictLikelihood, FileSyncState, type FileSyncAnalysis } from './file-sync-analysis';

/** 
 * Interface describing the summary of file sync analyses.
 */
export interface FileSyncSummary {
  totalFiles: number;
  upToDate: number;
  missing: number;
  ahead: number;
  behind: number;
  diverged: number;
  unrelated: number;
  outdated: number;
  possibleConflicts: number;
  autoResolvableConflictsByGit: number;
  manualResolvableConflicts: number;
}

/**
 * Summarizes an array of FileSyncAnalysis objects, counting various sync states
 * and conflict-related metrics.
 * 
 * @param analyses - Array of file sync analyses
 * @returns Summary object with counts of various sync states and conflict info
 */
export function summarizeFileSyncAnalyses(analyses: FileSyncAnalysis[]): FileSyncSummary {
  const summary: FileSyncSummary = {
    totalFiles: 0,
    upToDate: 0,
    missing: 0,
    ahead: 0,
    behind: 0,
    diverged: 0,
    unrelated: 0,
    outdated: 0,
    possibleConflicts: 0,
    autoResolvableConflictsByGit: 0,
    manualResolvableConflicts: 0, // Added for completeness
  };

  for (const file of analyses) {
    const { conflictAnalysis } = file;
    const { syncState, conflictLikelihood, autoResolvable } = conflictAnalysis;

    summary.totalFiles++;

    // Count syncState occurrences, safely cast enum to string key
    switch (syncState) {
      case FileSyncState.UpToDate:
        summary.upToDate++;
        break;
      case FileSyncState.Missing:
        summary.missing++;
        break;
      case FileSyncState.Ahead:
        summary.ahead++;
        break;
      case FileSyncState.Behind:
        summary.behind++;
        break;
      case FileSyncState.Diverged:
        summary.diverged++;
        break;
      case FileSyncState.Unrelated:
        summary.unrelated++;
        break;
      case FileSyncState.Outdated:
        summary.outdated++;
        break;
      default:
        break;
    }

    // Count conflicts with high or medium likelihood
    if (
      conflictLikelihood === ConflictLikelihood.High ||
      conflictLikelihood === ConflictLikelihood.Medium
    ) {
      summary.possibleConflicts++;

      if (autoResolvable === AutoResolvable.Git) {
        summary.autoResolvableConflictsByGit++;
      }
    }
  }

  summary.manualResolvableConflicts = summary.possibleConflicts - summary.autoResolvableConflictsByGit;

  return summary;
}