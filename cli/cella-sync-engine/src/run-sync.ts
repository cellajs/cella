import pc from "picocolors";

import { boilerplateConfig, forkConfig } from "./config/index";
import { handleBoilerplateIntoForkMerge } from "./modules/git/handle-boilerplate-into-fork-merge";
import { FileAnalysis } from "./types";
import { handleSquashMerge } from "./utils/git/handle-squash-merge";
import { handleRebase } from "./utils/git/handle-rebase";

export async function runSync(analyzedFiles: FileAnalysis[]) {
  console.log(pc.cyan("\nStarting sync process"));

  // Merge boilerplate into fork
  await handleBoilerplateIntoForkMerge(boilerplateConfig, forkConfig, analyzedFiles);

  // Squash merge (sync-branch → target-branch)
  const squashMergeIntoPath = forkConfig.repoPath;
  const squashMergeIntoBranch = forkConfig.targetBranch;
  const squashMergeFromBranch = forkConfig.branch;
  await handleSquashMerge(squashMergeIntoPath, squashMergeIntoBranch, squashMergeFromBranch);

  // Rebase target-branch (squash commit) → sync-branch
  const rebaseIntoPath = forkConfig.repoPath;
  const rebaseIntoBranch = forkConfig.branch;
  const rebaseFromBranch = forkConfig.targetBranch;
  await handleRebase(rebaseIntoPath, rebaseIntoBranch, rebaseFromBranch);
  
  console.log(pc.green("✔ Sync completed.\n"));
}
