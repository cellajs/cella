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
 * Conflicted files are left unstaged for IDE resolution.
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
    spinnerFail('sync completed with conflicts');
  }

  // Print summary only (no file lists for sync)
  printSummary(result.summary, 'merge summary');

  // Write log file if requested
  if (config.logFile) {
    const logPath = writeLogFile(config.forkPath, result.files);
    console.info();
    console.info(pc.dim(`full file list written to: ${logPath}`));
  }

  printSyncComplete(result);

  // Note about conflicts to resolve
  if (result.conflicts.length > 0) {
    console.info(pc.yellow(`${result.conflicts.length} files have merge conflicts to resolve.`));
  }

  return result;
}
