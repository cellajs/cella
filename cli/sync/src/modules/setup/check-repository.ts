import path from 'node:path';

import { RepoConfig } from '#/config';
import { isDirectory } from '#/utils/files';
import { gitLsRemote, gitRevParseIsInsideWorkTree } from '#/utils/git/command';

/**
 * Checks the repository connectivity and accessibility.
 *
 * @param repoConfig - The repository configuration
 *
 * @throws If connectivity validation fails
 * @returns void
 *
 * @example
 * await checkRepository(upstreamConfig);
 */
export async function checkRepository(repoConfig: RepoConfig) {
  // Folder must be a directory
  if (!(await isDirectory(repoConfig.workingDirectory))) {
    throw new Error(`${repoConfig.workingDirectory} is not a directory`);
  }

  // Directory must contain a .git folder
  if (!(await isDirectory(path.join(repoConfig.workingDirectory, '.git')))) {
    throw new Error(`.git directory missing in: ${repoConfig.workingDirectory}`);
  }

  // Check readablity with git plumbing
  try {
    // Cheap query → returns nothing but fails when repo is corrupted
    await gitRevParseIsInsideWorkTree(repoConfig.workingDirectory);
  } catch (e) {
    throw new Error(`Git repo looks corrupted in ${repoConfig.workingDirectory}`);
  }

  // When remote repository, check if we can access it and branch exists
  if (repoConfig.location === 'remote') {
    if (!repoConfig.remoteUrl) {
      throw new Error(`Remote URL is not defined for repository at "${repoConfig.workingDirectory}"`);
    }

    let lsRemoteOutput: string;
    try {
      lsRemoteOutput = await gitLsRemote(repoConfig.workingDirectory, repoConfig.remoteUrl);
    } catch (e) {
      throw new Error(
        `Failed to access remote repository at "${repoConfig.remoteUrl}" in "${repoConfig.workingDirectory}"`,
      );
    }

    // Verify the configured branch exists on the remote
    const branchRef = `refs/heads/${repoConfig.branch}`;
    const branchExists = lsRemoteOutput.split('\n').some((line) => line.includes(branchRef));

    if (!branchExists) {
      throw new Error(
        `Branch "${repoConfig.branch}" does not exist on remote "${repoConfig.remoteUrl}". ` +
          `Check your ${repoConfig.type} configuration or verify the branch hasn't been deleted.`,
      );
    }
  }
}
