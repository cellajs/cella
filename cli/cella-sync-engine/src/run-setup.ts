import pc from "picocolors";

import { checkConfig } from "./modules/setup/check-config";
import { checkRepository } from "./modules/setup/check-repository";
import { checkCleanState } from "./modules/setup/check-clean-state";
import { fetchLatestChanges } from "./modules/setup/fetch-latest-changes";

import { createBranchIfMissing } from "./utils/git/branches";
import { handleMerge } from "./utils/git/handle-merge";
import { addAsRemote } from "./modules/setup/add-as-remote";

import { config, type RepoConfig } from "./config";

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
 * await runSetup('syncBoilerplateIntoFork');
 */
export async function runSetup() {
  console.log(pc.cyan("\nRunning Setup"));

  // Basic configuration checks
  checkConfig(config.boilerplate, [
    { prop: 'branch', required: true },
    { prop: 'remoteName', requiredIf: (boilerplate: RepoConfig) => boilerplate.use === 'remote' },
    { prop: 'remoteUrl', requiredIf: (boilerplate: RepoConfig) => boilerplate.use === 'remote' },
  ]);

  checkConfig(config.fork, [
    { prop: 'branch', required: true },
    { prop: 'remoteName', requiredIf: (fork: RepoConfig) => fork.use === 'remote' },
    { prop: 'remoteUrl', requiredIf: (fork: RepoConfig) => fork.use === 'remote' },
    { prop: 'syncBranch', requiredIf: (fork: RepoConfig) => fork.use === 'local' && config.syncService === 'boilerplate-fork' },
    { prop: 'localPath', requiredIf: (fork: RepoConfig) => fork.use === 'local' },
  ]);

  // Check if repositories are accessible
  await checkRepository(config.boilerplate);
  await checkRepository(config.fork);

  // Ensure boilerplate remote is added to fork
  await addAsRemote(config.boilerplate, config.fork);

  // Ensure fork repository is clean (both working directory and target branch)
  await checkCleanState(config.fork.workingDirectory);
  await checkCleanState(config.fork.workingDirectory, config.fork.branch);

  // Check if sync-branch exists in fork, if not create it, then ensure it's clean
  await createBranchIfMissing(config.fork.workingDirectory, config.fork.syncBranch);
  await checkCleanState(config.fork.workingDirectory, config.fork.syncBranch);

  // Ensure latest changes are fetched for both repositories and left behind in a clean state
  await fetchLatestChanges(config.boilerplate);
  await fetchLatestChanges(config.fork);

  // Merge fork branch into sync branch to ensure it's up to date
  await handleMerge(config.fork.workingDirectory, config.fork.syncBranch, config.fork.branch, null);
  await checkCleanState(config.fork.workingDirectory, config.fork.syncBranch, { skipCheckout: true });

  console.log(pc.green("✔ Setup complete.\n"));
}