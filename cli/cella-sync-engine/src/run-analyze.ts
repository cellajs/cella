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

export async function runAnalyze(): Promise<FileAnalysis[]> {
  console.log(pc.cyan("\nRunning file analysis"));

  const spinner = yoctoSpinner({ text: "Fetching repo file list..." });
  spinner.start();

  const [boilerplateFiles, forkFiles] = await Promise.all([
    getGitFileHashes(config.boilerplate.workingDirectory, config.boilerplate.branch),
    getGitFileHashes(config.fork.workingDirectory, config.fork.syncBranch),
  ]);

  spinner.stop();

  spinner.start("Analyzing file histories...");

  const analyzedFiles = await analyzeManyFiles(
    config.boilerplate,
    config.fork,
    boilerplateFiles,
    forkFiles
  );

  spinner.stop();

  console.log(pc.green("✔ File analysis complete."));

  spinner.start("Update swizzle...");

  const swizzleEntries = extractSwizzleEntries(analyzedFiles);
  writeSwizzleMetadata(swizzleEntries);

  spinner.stop();
  console.log(pc.green("✔ Swizzle update complete."));

  // Log the analyzed files
  if (shouldLogAnalyzedFileModule()) {
    console.log(pc.bold("\nFile analysis:"));
    for (const file of analyzedFiles) {
      const line = analyzedFileLine(file);
      logAnalyzedFileLine(file, line);
    }
  }


  // Log the swizzle analysis
  if (shouldLogAnalyzedSwizzleModule()) {
    console.log(pc.bold("\nSwizzle analysis:"));
    for (const file of analyzedFiles) {
      const line = analyzedSwizzleLine(file);
      logAnalyzedSwizzleLine(file, line);
    }
  }

  // Log the summary of analyzed files
  if (shouldLogAnalyzedSummaryModule()) {
    console.log(pc.bold(`\nSummary:`));
    const summaryLines = analyzedSummaryLines(analyzedFiles);
    logAnalyzedSummaryLines(summaryLines);
  }

  return analyzedFiles
}