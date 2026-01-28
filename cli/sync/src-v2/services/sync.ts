/**
 * Sync service for sync CLI v2.
 *
 * Performs the actual merge in worktree and applies result via rsync.
 * Uses the same merge-engine as analyze.
 */

import pc from 'picocolors';
import type { MergeResult, RuntimeConfig } from '../config/types';
import {
  createSpinner,
  printConflicts,
  printDriftedWarning,
  printSummary,
  printSyncComplete,
  printSyncFiles,
  spinnerFail,
  spinnerSuccess,
  spinnerText,
  writeLogFile,
} from '../utils/display';
import { runMergeEngine } from './merge-engine';

/**
 * Run the sync service (full sync).
 *
 * Creates worktree, performs merge, applies via rsync, discards worktree.
 */
export async function runSync(config: RuntimeConfig): Promise<MergeResult> {
  createSpinner('Starting sync...');

  const result = await runMergeEngine(config, {
    apply: true,
    onProgress: (message) => {
      spinnerText(message);
    },
  });

  if (result.success) {
    spinnerSuccess('Sync complete');
  } else {
    spinnerFail('Sync completed with conflicts');
  }

  // Print results
  printSummary(result.summary);
  printSyncFiles(result.files);
  printDriftedWarning(result.files);

  // Handle conflicts
  if (result.conflicts.length > 0) {
    printConflicts(result.conflicts);
    console.info();
    console.info(pc.yellow('Sync was not applied due to unresolved conflicts.'));
    console.info(pc.dim('Resolve conflicts by adding files to pinned or ignored, then re-run.'));
    return result;
  }

  // Write log file if requested
  if (config.logFile) {
    const logPath = writeLogFile(config.forkPath, result.files);
    console.info();
    console.info(`Full file list written to: ${logPath}`);
  }

  printSyncComplete(result);

  return result;
}
