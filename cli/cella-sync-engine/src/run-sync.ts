import pc from "picocolors";

import { handleBoilerplateIntoForkMerge } from "./modules/git/handle-boilerplate-into-fork-merge";
import { FileAnalysis } from "./types";
import { handleSquashMerge } from "./utils/git/handle-squash-merge";
import { handleMerge } from "./utils/git/handle-merge";
import { config } from "./config"

/**
 * Runs the synchronization process between the boilerplate and fork repositories.
 */
export async function runSync(analyzedFiles: FileAnalysis[]) {
  console.info(pc.cyan("\nStarting sync process"));

  // Merge boilerplate into fork
  await handleBoilerplateIntoForkMerge(config.boilerplate, config.fork, analyzedFiles);

  // Squash merge (sync-branch → target-branch)
  const squashMergeIntoPath = config.fork.localPath;
  const squashMergeIntoBranch = config.fork.branchRef;
  const squashMergeFromBranch = config.fork.syncBranchRef;
  await handleSquashMerge(squashMergeIntoPath, squashMergeIntoBranch, squashMergeFromBranch, 5);

  // Merge target-branch (squash commit) → sync-branch
  const mergeIntoPath = config.fork.localPath;
  const mergeIntoBranch = config.fork.syncBranchRef;
  const mergeFromBranch = config.fork.branchRef;
  await handleMerge(mergeIntoPath, mergeIntoBranch, mergeFromBranch);
  
  console.info(pc.green("✔ Sync completed.\n"));
}
