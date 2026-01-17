import { config, RepoConfig } from '../../config';
import { hasRemoteBranch } from '../../utils/git/branches';
import { gitCheckout, gitFetch, gitPull } from '../../utils/git/command';
import { checkCleanState } from './check-clean-state';

/**
 * Ensures the latest changes are fetched for the repository.
 * - For remote repositories, performs a git fetch.
 * - For local repositories, pulls the latest changes for the main branch only.
 *   The sync branch is local-only and doesn't need to be pulled.
 *
 * @param repoConfig - The repository configuration
 * @returns Promise that resolves when the latest changes are fetched
 *
 * @example
 * await fetchLatestChanges(upstreamConfig);
 */
export async function fetchLatestChanges(repoConfig: RepoConfig) {
  // For remote repositories, ensure latest changes are fetched
  if (repoConfig.isRemote) {
    await gitFetch(repoConfig.workingDirectory, repoConfig.remoteName);
  }

  // For local repositories, pull changes for main branch only
  // (sync branch is local-only and doesn't need to be pulled)
  if (!repoConfig.isRemote) {
    await pullLatestChanges(repoConfig.workingDirectory, repoConfig.branchRef);
  }
}

/**
 * Handles pulling the latest changes for a local repository.
 * Also ensures the upstream remote exists before pulling.
 * And ensures the working directory is clean after pulling.
 *
 * @param localPath - The file system path to the repository
 * @param branchName - The name of the branch to pull changes for
 *
 * @throws If the upstream remote is missing and the configuration dictates to error
 * @returns Promise that resolves when the pull operation is complete
 */
async function pullLatestChanges(localPath: string, branchName: string) {
  const remoteBranch = `origin/${branchName}`;

  if (await hasRemoteBranch(localPath, remoteBranch)) {
    await gitCheckout(localPath, branchName);
    await gitPull(localPath, branchName);
    await checkCleanState(localPath, branchName, { skipCheckout: true });
    return;
  }

  if (config.behavior.onMissingRemote === 'error') {
    throw new Error(`Upstream remote for branch '${branchName}' is missing in repository at ${localPath}.`);
  }
}
