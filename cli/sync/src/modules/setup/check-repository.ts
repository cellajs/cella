import path from "node:path";

import { config, RepoConfig } from "../../config";
import { isDirectory } from "../../utils/files";
import { gitLsRemote, gitRevParseIsInsideWorkTree } from "../../utils/git/command";

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
  if (!(await isDirectory(path.join(repoConfig.workingDirectory, ".git")))) {
    throw new Error(`.git directory missing in: ${repoConfig.workingDirectory}`);
  }

  // Check readablity with git plumbing
  try {
    // Cheap query → returns nothing but fails when repo is corrupted
    await gitRevParseIsInsideWorkTree(repoConfig.workingDirectory);
  } catch (e) {
    throw new Error(`Git repo looks corrupted in ${repoConfig.workingDirectory}`);
  }

  // When remote repository OR we need to push remote, check if we can access it (e.g., via GitHub API)
  if (repoConfig.location === 'remote' || (!config.behavior.skipAllPushes && config.workingDirectory === repoConfig.workingDirectory)) {
    if (!repoConfig.remoteUrl) {
      throw new Error(`Remote URL is not defined for repository at "${repoConfig.workingDirectory}"`);
    }

    try {
      await gitLsRemote(repoConfig.workingDirectory, repoConfig.remoteUrl);
    } catch (e) {
      throw new Error(`Failed to access remote repository at "${repoConfig.remoteUrl}" in "${repoConfig.workingDirectory}"`);
    }
  }
}