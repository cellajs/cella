import pc from "picocolors";
import yoctoSpinner from 'yocto-spinner';

import { getGitFileHashes } from "./utils/git/files";
import { analyzeManyFiles } from "./modules/analyze-file";
import { analyzedFileLine, shouldLogAnalyzedFileModule, logAnalyzedFileLine } from "./log/analyzed-file";
import { analyzedSummaryLines, shouldLogAnalyzedSummaryModule, logAnalyzedSummaryLines } from "./log/analyzed-summary";
import { analyzedSwizzleLine, shouldLogAnalyzedSwizzleModule, logAnalyzedSwizzleLine } from "./log/analyzed-swizzle";
import { extractSwizzleEntries } from "./modules/swizzle/analyze";
import { writeSwizzleMetadata } from "./modules/swizzle/metadata";
import { FileAnalysis } from "./types";
import { config } from "./config";

/**
 * Runs the file analysis process, comparing files between the boilerplate and fork repositories.
 * This includes fetching file lists, analyzing file histories, updating swizzle metadata (if applicable),
 * and logging the results.
 */
export async function runAnalyze(): Promise<FileAnalysis[]> {
  console.info(pc.cyan("\nRunning file analysis"));

  const spinner = yoctoSpinner({ text: "Fetching repo file list..." });
  spinner.start();

  // Fetch file hashes from both boilerplate and fork repositories in parallel
  const [boilerplateFiles, forkFiles] = await Promise.all([
    getGitFileHashes(config.boilerplate.workingDirectory, config.boilerplate.branchRef),
    getGitFileHashes(config.fork.workingDirectory, config.fork.syncBranchRef),
  ]);

  spinner.stop();
  spinner.start("Analyzing file histories...");

  // Analyze files by comparing boilerplate and fork file hashes
  const analyzedFiles = await analyzeManyFiles(
    config.boilerplate,
    config.fork,
    boilerplateFiles,
    forkFiles
  );

  spinner.stop();
  console.info(pc.green("✔ File analysis complete."));
  spinner.start("Update swizzle...");

  // Extract swizzle entries from analyzed files and update swizzle metadata
  const swizzleEntries = extractSwizzleEntries(analyzedFiles);
  writeSwizzleMetadata(swizzleEntries);

  spinner.stop();
  console.info(pc.green("✔ Swizzle update complete."));

  // Log the analyzed files
  if (shouldLogAnalyzedFileModule()) {
    console.info(pc.bold("\nFile analysis:"));
    for (const file of analyzedFiles) {
      const line = analyzedFileLine(file);
      logAnalyzedFileLine(file, line);
    }
  }

  // Log the swizzle analysis
  if (shouldLogAnalyzedSwizzleModule()) {
    console.info(pc.bold("\nSwizzle analysis:"));
    for (const file of analyzedFiles) {
      const line = analyzedSwizzleLine(file);
      logAnalyzedSwizzleLine(file, line);
    }
  }

  // Log the summary of analyzed files
  if (shouldLogAnalyzedSummaryModule()) {
    console.info(pc.bold(`\nSummary:`));
    const summaryLines = analyzedSummaryLines(analyzedFiles);
    logAnalyzedSummaryLines(summaryLines);
  }

  // Return the analyzed files data
  return analyzedFiles
}