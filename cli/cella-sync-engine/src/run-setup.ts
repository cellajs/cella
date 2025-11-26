import pc from "picocolors";

import { checkConfig } from "./modules/setup/check-config";
import { checkRepository } from "./modules/setup/check-repository";
import { checkCleanState } from "./modules/setup/check-clean-state";
import { fetchLatestChanges } from "./modules/setup/fetch-latest-changes";

import { createBranchIfMissing } from "./utils/git/branches";
import { handleMerge } from "./utils/git/handle-merge";
import { addAsRemote } from "./modules/setup/add-as-remote";

import { config } from "./config";

/**
 * Performs all preflight setup steps required before running any sync operations.
 *
 * Responsibilities:
 *
 * 1. **Configuration validation**  
 *    Ensures required properties exist in both boilerplate and fork configurations:
 *    - `branchRef`  
 *    - `syncBranchRef` (fork only)  
 *    - `repoReference`
 *
 * 2. **Repository accessibility checks**  
 *    Verifies that both repositories can be accessed via the provided paths or remotes.
 *
 * 3. **Remote setup**  
 *    Ensures the boilerplate repository is added as a remote in the fork repository.
 *
 * 4. **Working directory cleanliness**  
 *    Validates that the fork repository is in a clean state:
 *    - working directory clean  
 *    - target branch clean  
 *    - sync branch exists and is clean
 *
 * 5. **Branch and remote preparation**  
 *    Creates missing branches (sync branch) and fetches latest commits for both repositories.
 *
 * 6. **Sync branch alignment**  
 *    Merges the fork branch into the sync branch to ensure it's up-to-date.
 *
 * @throws Will throw an error if any setup step fails (invalid config, inaccessible repository, unclean state, etc.)
 *
 * @example
 * await runSetup();
 */
export async function runSetup() {
  console.info(pc.cyan("Running Setup"));

  // Basic configuration validation
  checkConfig(config.boilerplate, [
    { prop: 'branchRef', required: true },
    { prop: 'repoReference', required: true }
  ]);

  checkConfig(config.fork, [
    { prop: 'branchRef', required: true },
    { prop: 'syncBranchRef', required: true },
    { prop: 'repoReference', required: true }
  ]);

  // Verify repository accessibility
  await checkRepository(config.boilerplate);
  await checkRepository(config.fork);

  // Ensure boilerplate is added as a remote in the fork
  await addAsRemote(config.boilerplate, config.fork);

  // Ensure fork working directory and branches are clean
  await checkCleanState(config.fork.workingDirectory);
  await checkCleanState(config.fork.workingDirectory, config.fork.branchRef);

  // Create sync branch if missing, then check it's clean
  await createBranchIfMissing(config.fork.workingDirectory, config.fork.syncBranchRef);
  await checkCleanState(config.fork.workingDirectory, config.fork.syncBranchRef);

  // Fetch latest changes for both repositories
  await fetchLatestChanges(config.boilerplate);
  await fetchLatestChanges(config.fork);

  // Merge fork branch into sync branch to ensure sync branch is up-to-date
  await handleMerge(config.fork.workingDirectory, config.fork.syncBranchRef, config.fork.branchRef, null);

  // Ensure sync branch is clean post-merge
  await checkCleanState(config.fork.workingDirectory, config.fork.syncBranchRef, { skipCheckout: true });

  console.info(pc.green("✔ Setup complete."));
}