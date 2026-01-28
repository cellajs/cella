/**
 * Analyze service for sync CLI v2.
 *
 * Dry run of sync - shows what would change without applying.
 * Uses the same merge-engine as sync, but discards the result.
 */

import type { MergeResult, RuntimeConfig } from '../config/types';
import {
  createSpinner,
  printAnalyzeComplete,
  printConflicts,
  printDriftedWarning,
  printSummary,
  printSyncFiles,
  spinnerSuccess,
  spinnerText,
  writeLogFile,
} from '../utils/display';
import { runMergeEngine } from './merge-engine';

/**
 * Run the analyze service (dry run).
 *
 * Creates worktree, performs merge, shows results, discards worktree.
 */
export async function runAnalyze(config: RuntimeConfig): Promise<MergeResult> {
  createSpinner('Starting analysis...');

  const result = await runMergeEngine(config, {
    apply: false,
    onProgress: (message) => {
      spinnerText(message);
    },
  });

  spinnerSuccess('Analysis complete');

  // Print results
  printSummary(result.summary);
  printSyncFiles(result.files);
  printDriftedWarning(result.files);
  printConflicts(result.conflicts);

  // Write log file if requested
  if (config.logFile) {
    const logPath = writeLogFile(config.forkPath, result.files);
    console.info();
    console.info(`Full file list written to: ${logPath}`);
  }

  printAnalyzeComplete();

  return result;
}
