import pc from "picocolors";
import yoctoSpinner from 'yocto-spinner';

import { boilerplateConfig, forkConfig } from "./config/index";
import { getGitFileHashes } from "./utils/git/files";
import { analyzeManyFiles } from "./modules/analyze-file";
import { analyzedFileLine, logAnalyzedFileLine } from "./log/analyzed-file";
import { analyzedSummaryLines, logAnalyzedSummaryLines } from "./log/analyzed-summary";
import { analyzedSwizzleLine, logAnalyzedSwizzleLine } from "./log/analyzed-swizzle";
import { extractSwizzleEntries } from "./modules/swizzle/analyze";
import { writeSwizzleMetadata } from "./modules/swizzle/metadata";
import { FileAnalysis } from "./types";

export async function runAnalyze(): Promise<FileAnalysis[]>  {
  console.log(pc.cyan("\nRunning file analysis"));

  const spinner = yoctoSpinner({ text: "Fetching repo file list..." });
  spinner.start();

  const [boilerplateFiles, forkFiles] = await Promise.all([
    getGitFileHashes(boilerplateConfig.repoPath, boilerplateConfig.branch),
    getGitFileHashes(forkConfig.repoPath, forkConfig.branch),
  ]);

  spinner.stop();

  spinner.start("Analyzing file histories...");

  const analyzedFiles = await analyzeManyFiles(
    boilerplateConfig,
    forkConfig,
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
  console.log(pc.bold("\nFile analysis:"));
  for (const file of analyzedFiles) {
    const line = analyzedFileLine(file);
    logAnalyzedFileLine(file, line);
  }

  // Log the swizzle analysis
  console.log(pc.bold("\nSwizzle analysis:"));
  for (const file of analyzedFiles) {
    const line = analyzedSwizzleLine(file);
    logAnalyzedSwizzleLine(file, line);
  }

  // Log the summary of analyzed files
  console.log(pc.bold(`\nSummary:`));
  const summaryLines = analyzedSummaryLines(analyzedFiles);
  logAnalyzedSummaryLines(summaryLines);

  return analyzedFiles
}