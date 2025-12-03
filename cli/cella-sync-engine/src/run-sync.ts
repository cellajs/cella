import pc from "picocolors";

import { handleBoilerplateIntoForkMerge } from "./modules/git/handle-boilerplate-into-fork-merge";
import { FileAnalysis } from "./types";
import { handleSquashMerge } from "./utils/git/handle-squash-merge";
import { handleMerge } from "./utils/git/handle-merge";
import { config } from "./config"

/**
 * Runs the full synchronization process between the boilerplate and fork repositories.
 *
 * This function orchestrates the following steps:
 *
 * 1. **Merge boilerplate into fork**  
 *    Applies all updates from the boilerplate repository into the fork's sync branch.
 *    Conflicts are analyzed and resolved according to the swizzle rules.
 *
 * 2. **Squash sync branch into target branch**  
 *    Collapses all sync-related commits into a single commit on the fork's target branch.
 *    Optionally, includes the last N commit messages from the sync branch (currently 5)
 *    in the squash commit message for traceability.
 *
 * 3. **Merge target branch back into sync branch**  
 *    Ensures that the sync branch is updated with the latest squash commit,
 *    keeping history clean and consistent.
 *
 * Logging is printed at each stage to provide feedback in the CLI.
 *
 * @param analyzedFiles - Array of `FileAnalysis` objects returned from `runAnalyze()`.
 *                      This contains information about files to sync and swizzle metadata.
 *
 * @example
 * await runSync(analyzedFiles);
 * 
 * @returns A promise that resolves when the sync process is complete.
 */
export async function runSync(analyzedFiles: FileAnalysis[]) {
  console.info(pc.cyan("\nStarting sync process"));

  // Merge boilerplate into fork (sync-branch)
  await handleBoilerplateIntoForkMerge(config.boilerplate, config.fork, analyzedFiles);
  console.info(pc.green("✔ Boilerplate changes merged into fork sync branch."));

  // Squash merge sync-branch → target branch
  const squashMergeIntoPath = config.fork.localPath;
  const squashMergeIntoBranch = config.fork.branchRef;
  const squashMergeFromBranch = config.fork.syncBranchRef;

  // The last parameter (5) indicates we include the last 5 commit messages in the squash commit
  await handleSquashMerge(squashMergeIntoPath, squashMergeIntoBranch, squashMergeFromBranch);
  console.info(pc.green("✔ Sync branch squash-merged into target branch."));

  console.info(pc.green("✔ Sync completed.\n"));
}
