import pc from "picocolors";

import { handleBoilerplateIntoForkMerge } from "./modules/git/handle-boilerplate-into-fork-merge";
import { FileAnalysis } from "./types";
import { handleSquashMerge } from "./utils/git/handle-squash-merge";
import { handleRebase } from "./utils/git/handle-rebase";
import { config } from "./config"

export async function runSync(analyzedFiles: FileAnalysis[]) {
  console.log(pc.cyan("\nStarting sync process"));

  // Merge boilerplate into fork
  await handleBoilerplateIntoForkMerge(config.boilerplate, config.fork, analyzedFiles);

  // Squash merge (sync-branch → target-branch)
  const squashMergeIntoPath = config.fork.localPath;
  const squashMergeIntoBranch = config.fork.branch;
  const squashMergeFromBranch = config.fork.syncBranch;
  await handleSquashMerge(squashMergeIntoPath, squashMergeIntoBranch, squashMergeFromBranch);

  // Rebase target-branch (squash commit) → sync-branch
  const rebaseIntoPath = config.fork.localPath;
  const rebaseIntoBranch = config.fork.syncBranch;
  const rebaseFromBranch = config.fork.branch;
  await handleRebase(rebaseIntoPath, rebaseIntoBranch, rebaseFromBranch);
  
  console.log(pc.green("✔ Sync completed.\n"));
}
