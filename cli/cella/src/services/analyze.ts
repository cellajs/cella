/**
 * Analyze service for sync CLI v2.
 *
 * Dry run of sync - shows what would change without applying.
 * Uses the same merge-engine as sync, but discards the result.
 */

import pc from 'picocolors';
import type { MergeResult, RuntimeConfig } from '../config/types';
import {
  createSpinner,
  type LinkOptions,
  printAnalyzeComplete,
  printDivergedPreview,
  printDriftedWarning,
  printPinnedPreview,
  printSummary,
  printSyncFiles,
  resetSteps,
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
  resetSteps();
  createSpinner('Starting analysis...');

  const result = await runMergeEngine(config, {
    apply: false,
    onProgress: (message) => {
      spinnerText(message);
    },
    onStep: (label, detail) => {
      spinnerSuccess(label, detail);
      createSpinner('...');
    },
  });

  spinnerSuccess();

  // Build link options from result and config
  const linkOptions: LinkOptions = {
    upstreamGitHubUrl: result.upstreamGitHubUrl,
    upstreamBranch: result.upstreamBranch,
    fileLinkMode: config.settings.fileLinkMode,
    upstreamLocalPath: config.settings.upstreamLocalPath,
    forkPath: config.forkPath,
  };

  // Print file lists first (analyze shows file lists for review)
  printSyncFiles(result.files, linkOptions);
  printDriftedWarning(result.files, linkOptions);
  printDivergedPreview(result.files, linkOptions);
  printPinnedPreview(result.files, linkOptions);

  // Print summary at the end
  printSummary(result.summary, 'analysis summary');

  // Write log file if requested
  if (config.logFile) {
    const logPath = writeLogFile(config.forkPath, result.files);
    console.info();
    console.info(pc.dim(`Full file list written to: ${logPath}`));
  }

  printAnalyzeComplete();

  return result;
}
