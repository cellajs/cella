import pc from "picocolors";
import yoctoSpinner from 'yocto-spinner';
import { boilerplateConfig, forkConfig } from "./config";
import { getGitFileHashes } from "./utils/git/files";
import { analyzeManyFiles } from "./modules/analyze-file";
import { analyzedFileLine, logAnalyzedFileLine } from "./log/analyzed-file";
import { analyzedSummaryLines, logAnalyzedSummaryLines } from "./log/analyzed-summary";
import { analyzedZwizzleLine, logAnalyzedZwizzleLine } from "./log/analyzed-zwizzle";
import { extractZwizzleEntries } from "./modules/zwizzle/analyze";
import { writeZwizzleMetadata } from "./modules/zwizzle/metadata";

import { runSync } from "./run-sync";

async function main(): Promise<void> {
  console.log(pc.cyan("↻ Starting git-sync..."));

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

  spinner.start("Update zwizzle...");
  
  const zwizzleEntries = extractZwizzleEntries(analyzedFiles);
  writeZwizzleMetadata(zwizzleEntries);

  spinner.stop();

  // Log the analyzed files
  console.log(pc.bold("\nFile analysis:"));
  for (const file of analyzedFiles) {
    const line = analyzedFileLine(file);
    logAnalyzedFileLine(file, line);
  }

  // Log the zwizzle analysis
  console.log(pc.bold("\nZwizzle analysis:"));
  for (const file of analyzedFiles) {
    const line = analyzedZwizzleLine(file);
    logAnalyzedZwizzleLine(file, line);
  }

  // Log the summary of analyzed files
  console.log(pc.bold(`\nSummary:`));
  const summaryLines = analyzedSummaryLines(analyzedFiles);
  logAnalyzedSummaryLines(summaryLines);

  await runSync(analyzedFiles);
}

main().catch((err) => {
  console.error(pc.red("❌ Error:"), err.message);
});