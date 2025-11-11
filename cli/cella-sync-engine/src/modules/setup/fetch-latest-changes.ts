import { behaviorConfig } from "../../config";

import { gitCheckout, gitFetch, gitPull } from "../../utils/git/command";
import { hasRemoteBranch } from "../../utils/git/branches";
import { RepoConfig } from "../../types/config";
import { checkCleanState } from "./check-clean-state";

/**
 * Ensures the latest changes are fetched for the repository.
 * - For remote repositories, performs a git fetch.
 * - For local repositories, pulls the latest changes for the main and target branches.
 * Also ensures the working directory is clean after pulling.
 * @param repoConfig - The repository configuration
 */
export async function fetchLatestChanges(repoConfig: RepoConfig) {
  // For remote repositories, ensure latest changes are fetched
  if (repoConfig.use === 'remote') {
    await gitFetch(repoConfig.repoPath, repoConfig.remoteName);
  }

  // For local repositories, pull changes
  if (repoConfig.use === 'local') {
    await pullLatestChanges(repoConfig.repoPath, repoConfig.branch);

    if (repoConfig.targetBranch) {
      await pullLatestChanges(repoConfig.repoPath, repoConfig.targetBranch);
    }
  }
}

/**
 * Handles pulling the latest changes for a local repository.
 * Also ensures the upstream remote exists before pulling.
 * And ensures the working directory is clean after pulling.
 * @param repoPath - The file system path to the repository
 * @param branchName - The name of the branch to pull changes for
 * @returns 
 */
async function pullLatestChanges(repoPath: string, branchName: string) {
  const remoteBranch = `origin/${branchName}`;

  if (await hasRemoteBranch(repoPath, remoteBranch)) {
    await gitCheckout(repoPath, branchName);
    await gitPull(repoPath, branchName);
    await checkCleanState(repoPath, branchName, { skipCheckout: true });
    return;
  }

  if (behaviorConfig.onMissingUpstream === 'error') {
    throw new Error(`Upstream remote for branch '${branchName}' is missing in repository at ${repoPath}.`);
  }
}