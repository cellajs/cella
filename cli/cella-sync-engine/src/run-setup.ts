import pc from "picocolors";

import { checkConfig } from "./modules/setup/check-config";
import { checkRepository } from "./modules/setup/check-repository";
import { checkCleanState } from "./modules/setup/check-clean-state";
import { fetchLatestChanges } from "./modules/setup/fetch-latest-changes";

import { boilerplateConfig, forkConfig } from "./config/index";
import { RepoConfig } from "./types/config";
import { createBranchIfMissing } from "./utils/git/branches";
import { handleMerge } from "./utils/git/handle-merge";
import { addAsRemote } from "./modules/setup/add-as-remote";

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
  checkConfig(boilerplateConfig, [
    { prop: 'branch', required: true },
    { prop: 'remoteName', required: true },
    { prop: 'use', required: true },
    { prop: 'repoPath', required: true },
    { prop: 'remoteUrl', requiredIf: (config: RepoConfig) => config.use === 'remote' },
  ]);

  checkConfig(forkConfig, [
    { prop: 'branch', required: true },
    { prop: 'targetBranch', required: true },
    { prop: 'use', required: true, allowedValues: ['local'] },
    { prop: 'repoPath', requiredIf: (config: RepoConfig) => config.use === 'local' },
  ]);

  // Check if repositories are accessible
  await checkRepository(boilerplateConfig);
  await checkRepository(forkConfig);

  // Ensure boilerplate remote is added to fork
  await addAsRemote(boilerplateConfig, forkConfig);

  // Ensure fork repository is clean (both working directory and target branch)
  await checkCleanState(forkConfig.repoPath);
  await checkCleanState(forkConfig.repoPath, forkConfig.targetBranch);

  // Check if sync-branch exists in fork, if not create it, then ensure it's clean
  await createBranchIfMissing(forkConfig.repoPath, forkConfig.branch);
  await checkCleanState(forkConfig.repoPath, forkConfig.branch);

  // If boilerplate is local, also ensure working directory is clean
  if (boilerplateConfig.use === 'local') {
    await checkCleanState(boilerplateConfig.repoPath);
    await checkCleanState(boilerplateConfig.repoPath, boilerplateConfig.branch);
  }

  // Ensure latest changes are fetched for both repositories and left behind in a clean state
  await fetchLatestChanges(boilerplateConfig);
  await fetchLatestChanges(forkConfig);

  // Merge fork target branch into sync branch to ensure it's up to date
  await handleMerge(forkConfig.repoPath, forkConfig.branch, forkConfig.targetBranch, null);
  await checkCleanState(forkConfig.repoPath, forkConfig.branch, { skipCheckout: true });

  console.log(pc.green("✔ Setup complete.\n"));
}