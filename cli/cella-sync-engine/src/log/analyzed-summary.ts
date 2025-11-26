import pc from 'picocolors';

import { FileAnalysis } from '../types';
import { config } from '../config';

/**
 * Generates summary lines from the analyzed files.
 * 
 * @param analyzedFiles - Array of FileAnalysis objects.
 * @returns string[] - An array of summary lines.
 */
export function analyzedSummaryLines(analyzedFiles: FileAnalysis[]): string[] {

  // Initialize summary counts
  const Summary: Record<string, number> = {
    totalFiles: 0,
    upToDate: 0,
    ahead: 0,
    behind: 0,
    diverged: 0,
    unrelated: 0,
    unknown: 0,
    swizzled: 0,
    swizzledNew: 0,
  }

  for (const file of analyzedFiles) {
    // Increment total files count
    Summary.totalFiles++;

    // Increment count based on git status
    const gitStatus = file.commitSummary?.status || 'unknown';

    if (gitStatus in Summary) {
      Summary[gitStatus]++;
    } else {
      Summary.unknown++;
    }

    // Increment swizzle counts
    const swizzle = file.swizzle;
    if (swizzle) {
      if (swizzle?.existingMetadata?.swizzled || swizzle?.newMetadata?.swizzled) {
        Summary.swizzled++;

        if (swizzle.newMetadata?.swizzled) {
          Summary.swizzledNew++;
        }
      }
    }
  }

  // Construct and return summary lines
  return [
    `  Total Files: ${pc.bold(Summary.totalFiles)}`,
    `  Up to Date: ${pc.bold(pc.green(Summary.upToDate))}`,
    `  Ahead: ${pc.bold(pc.green(Summary.ahead))}`,
    `  Behind: ${pc.bold(pc.yellow(Summary.behind))}`,
    `  Diverged: ${pc.bold(pc.red(Summary.diverged))}`,
    `  Unrelated: ${pc.bold(pc.red(Summary.unrelated))}`,
    `  Unknown: ${pc.bold(pc.red(Summary.unknown))}`,
    `  Swizzled: ${pc.bold(pc.cyan(Summary.swizzled))} (${pc.bold(pc.cyan(Summary.swizzledNew))} new swizzles)`,
  ];
}

/**
 * Determines if the analyzed summary module should be logged based on the configuration.
 * 
 * @returns boolean - True if the module should be logged, false otherwise.
 */
export function shouldLogAnalyzedSummaryModule(): boolean {
  const logModulesConfigured = 'modules' in config.log;

  if (!logModulesConfigured) {
    return true;
  }
  
  return config.log.modules?.includes('analyzedSummary') || false;
}

/** 
 * Logs the analyzed summary lines to the console based on the configuration.
 * 
 * @param lines - Array of summary lines to log.
 */
export function logAnalyzedSummaryLines(lines: string[]): void {
  if (lines.length === 0) {
    return;
  }

  if (shouldLogAnalyzedSummaryModule()) {
    for (const line of lines) {
      console.info(line);
    }
  }
}
