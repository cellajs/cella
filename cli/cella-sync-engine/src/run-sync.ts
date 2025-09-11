import pc from "picocolors";

import { boilerplateConfig, forkConfig } from "./config";

import { prepareSyncBranch } from "./modules/git/prepare-sync-branch";
import { handleMerge } from "./modules/git/handle-merge";

import { FileAnalysis } from "./types";

export async function runSync(analyzedFiles: FileAnalysis[]) {
  console.log(pc.cyan("↻ Starting merge..."));

  await prepareSyncBranch(boilerplateConfig, forkConfig);
  await handleMerge(boilerplateConfig, forkConfig, analyzedFiles);



  // Map analyses by file path for quick access
  // const analysisMap = new Map(
  //   analyses.map((a) => [a.filePath, a])
  // );

  // const mergeSucceeded = gitMerge(forkConfig.filePath, `boilerplate/${boilerplateConfig.branch}`);

  // if (mergeSucceeded) {
  //   console.log('✅ Merge successful. No conflicts.');
  // } else {
  //   console.log('⚠️ Merge conflict in progress. Resolution required.');
  // }

  // const isMerging = existsSync(`${forkRepoPath}/.git/MERGE_HEAD`);

  // if (isMerging) {
  //   const conflictedFiles = getConflictedFiles(forkConfig.filePath);
  //   console.log(`🧨 Found ${conflictedFiles.length} conflict(s):`);
  //   conflictedFiles.forEach(file => console.log(` - ${file}`));
  //   const unresolvedConflicts = await autoResolveConflicts(boilerplateConfig, forkConfig, conflictedFiles, analysisMap);
  //   console.log(`🔧 Attempted to auto-resolve conflicts. Unresolved: ${unresolvedConflicts}`);
  // } else {
  //   console.log('✅ No merge conflicts detected, proceeding with sync.');
  // }

  // if (hasUnresolvedConflicts(forkConfig.filePath)) {
  //   console.log('⚠️ There are still unresolved conflicts after auto-resolution. Please resolve them manually.');
  // } else {
  //   // All good, finalize the merge
  //   execSync(`git -C ${forkConfig.filePath} commit --no-verify -m "Merge boilerplate into sync-branch: resolved using ours strategy"`);
  // }


  // console.log('\n🎉 Sync complete!');
}