import pc from "picocolors";
import yoctoSpinner from 'yocto-spinner';
import { boilerplateConfig, forkConfig } from "./config";
import { getGitFileHashes } from "./utils/git/files";
import { getFileSyncAnalyses } from './file-sync-analysis';
import { summarizeFileSyncAnalyses } from './file-sync-summary';
import { formatAnalysisLogs } from "./analyse-formatter";
import { shouldLogFile, shouldLogSummary } from "./should-log";
import { canGitAutoMergeFile, GitMergeCheckResult } from "./can-git-auto-merge-file";
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

  const fileSyncAnalyses = await getFileSyncAnalyses(
    boilerplateConfig,
    forkConfig,
    boilerplateFiles,
    forkFiles
  );

  spinner.stop();

  console.log(pc.bold("\n🗀 File Sync Status:\n"));

  for (const file of fileSyncAnalyses) {
    if (!shouldLogFile(file)) continue;
    const formattedLog = formatAnalysisLogs(file);
    console.log(formattedLog);
  }

  if (shouldLogSummary()) {
    const summary = summarizeFileSyncAnalyses(fileSyncAnalyses);

    // Final summary
    console.log(pc.bold(`\n Summary:`));
    console.log(`  ${pc.green('✔')} Up to date:    ${pc.green(summary.upToDate)} Files`);
    console.log(`  ${pc.red('✗')} Missing:       ${pc.red(summary.missing)} Files`);
    console.log(`  ${pc.green('⇧')} Ahead:         ${pc.green(summary.ahead)} Files`);
    console.log(`  ${pc.yellow('⇩')} Behind:        ${pc.yellow(summary.behind)} Files`);
    console.log(`  ${pc.magenta('⇔')} Diverged:      ${pc.magenta(summary.diverged)} Files`);
    console.log(`  ${pc.gray('⊗')} Unrelated:     ${pc.gray(summary.unrelated)} Files`);
    console.log(`  ${pc.yellow('…')} Outdated:      ${pc.yellow(summary.outdated)} Files`);

    console.log(pc.bold(`\nMerge Conflict Overview:`));
    console.log(`  ✖ Possible Conflicts: ${pc.yellow(summary.possibleConflicts)} Files`);
    console.log(`  ✔ Auto-Resolvable Conflicts by Git: ${pc.cyan(summary.autoResolvableConflictsByGit)} Files`);
    console.log(`  ! Manual Resolvable Conflicts: ${pc.red(summary.manualResolvableConflicts)} Files`);

    console.log('\n')
  }

  // await runSync(boilerplateConfig, forkConfig, fileSyncAnalyses)
}

main().catch((err) => {
  console.error(pc.red("❌ Error:"), err.message);
});