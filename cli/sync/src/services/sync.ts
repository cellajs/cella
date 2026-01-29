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
  printSummary,
  printSyncComplete,
  resetSteps,
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
  resetSteps();
  createSpinner('Starting sync...');

  const result = await runMergeEngine(config, {
    apply: true,
    onProgress: (message) => {
      spinnerText(message);
    },
    onStep: (label, detail) => {
      spinnerSuccess(label, detail);
      createSpinner('...');
    },
  });

  if (result.success) {
    spinnerSuccess();
  } else {
    spinnerFail('Sync completed with conflicts');
  }

  // Print summary only (no file lists for sync)
  printSummary(result.summary);

  // Handle conflicts
  if (result.conflicts.length > 0) {
    printConflicts(result.conflicts);
    console.info();
    console.info(pc.yellow('Conflicts need manual resolution.'));
    console.info(pc.dim('Add files to pinned or ignored, then re-run.'));
  }

  // Write log file if requested
  if (config.logFile) {
    const logPath = writeLogFile(config.forkPath, result.files);
    console.info();
    console.info(pc.dim(`Full file list written to: ${logPath}`));
  }

  printSyncComplete(result);

  return result;
}
