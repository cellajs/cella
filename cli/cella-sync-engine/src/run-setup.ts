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
 * Setup checks config and repositories before running any scripts.
 * For now we only support the flow: Boilerplate → Fork (via sync branch).
 * - Ensures boilerplate repository settings are correct.
 * - Ensures fork repository settings are correct.
 * - Validates connectivity to both repositories.
 * - Prepare repositories by ensuring remotes and branches exist.
 * 
 * @throws If any setup check fails
 *
 * @example
 * await runSetup();
 */
export async function runSetup() {
  console.info(pc.cyan("\nRunning Setup"));

  // Basic configuration checks
  checkConfig(config.boilerplate, [
    { prop: 'branchRef', required: true },
    { prop: 'repoReference', required: true }
  ]);

  checkConfig(config.fork, [
    { prop: 'branchRef', required: true },
    { prop: 'syncBranchRef', required: true },
    { prop: 'repoReference', required: true }
  ]);

  // Check if repositories are accessible
  await checkRepository(config.boilerplate);
  await checkRepository(config.fork);

  // Ensure boilerplate remote is added to fork
  await addAsRemote(config.boilerplate, config.fork);

  // Ensure fork repository is clean (both working directory and target branch)
  await checkCleanState(config.fork.workingDirectory);
  await checkCleanState(config.fork.workingDirectory, config.fork.branchRef);

  // Check if sync-branch exists in fork, if not create it, then ensure it's clean
  await createBranchIfMissing(config.fork.workingDirectory, config.fork.syncBranchRef);
  await checkCleanState(config.fork.workingDirectory, config.fork.syncBranchRef);

  // Ensure latest changes are fetched for both repositories and left behind in a clean state
  await fetchLatestChanges(config.boilerplate);
  await fetchLatestChanges(config.fork);

  // Merge fork branch into sync branch to ensure it's up to date
  await handleMerge(config.fork.workingDirectory, config.fork.syncBranchRef, config.fork.branchRef, null);
  await checkCleanState(config.fork.workingDirectory, config.fork.syncBranchRef, { skipCheckout: true });

  console.info(pc.green("✔ Setup complete.\n"));
}