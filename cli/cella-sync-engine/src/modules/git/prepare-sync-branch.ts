import { RepoConfig } from '../../types/config';
import { gitFetch, gitCheckout } from '../../utils/git/command';
import { addRemoteIfMissing } from '../../utils/git/remotes';

/**
 * Prepares a sync branch in the fork repository by:
 * 1. Ensuring the boilerplate repository is added as a remote.
 * 2. Fetching the latest commits from the boilerplate.
 * 3. Checking out the sync branch in the fork repository.
 *
 * @param boilerplateConfig - Configuration of the boilerplate repository (upstream)
 * @param forkConfig - Configuration of the fork repository (destination)
 *
 * @returns Promise<void>
 */
export async function prepareSyncBranch(boilerplateConfig: RepoConfig, forkConfig: RepoConfig) {
  // Ensure boilerplate repo is added as a remote in fork
  await addRemoteIfMissing(forkConfig.repoPath, boilerplateConfig.addAsRemoteName, boilerplateConfig.repoPath);

  // Fetch latest commits from the boilerplate
  await gitFetch(forkConfig.repoPath, boilerplateConfig.addAsRemoteName);

  // Checkout the sync branch in the fork repository
  await gitCheckout(forkConfig.repoPath, forkConfig.branch);
}