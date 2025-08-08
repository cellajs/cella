import pc from "picocolors";
import yoctoSpinner from 'yocto-spinner';
import { boilerplateConfig, forkConfig } from "./config";
import { getGitFileHashes } from "./utils/git/files";
import { analyzeManyFiles } from "./modules/git/analyze-file";
import { analyzedFileLine, logAnalyzedFileLine } from "./log/analyzed-file";
import { analyzedSummaryLines } from "./log/analyzed-summary";

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

  console.log(pc.bold("\n🗀 File Sync Status:\n"));

  for (const file of analyzedFiles) {
    logAnalyzedFileLine(file, analyzedFileLine(file));
  }

  const summaryLines = analyzedSummaryLines(analyzedFiles);
  console.log("\n" + summaryLines.join("\n"));

  // await runSync(boilerplateConfig, forkConfig, fileSyncAnalyses)
}

main().catch((err) => {
  console.error(pc.red("❌ Error:"), err.message);
});