import path from "node:path";

import { RepoConfig } from "../../types/config";
import { isDirectory } from "../../utils/files";
import { gitLsRemote, gitRevParseIsInsideWorkTree } from "../../utils/git/command";

/**
 * Checks the repository connectivity and accessibility.
 * @param repoConfig - The repository configuration
 * @throws If connectivity validation fails
 *
 * @example
 * await checkRepository(boilerplateConfig);
 */
export async function checkRepository(repoConfig: RepoConfig) {
  // Folder must be a directory
  if (!(await isDirectory(repoConfig.repoPath))) {
    throw new Error(`${repoConfig.repoPath} is not a directory`);
  }

  // Directory must contain a .git folder
  if (!(await isDirectory(path.join(repoConfig.repoPath, ".git")))) {
    throw new Error(`.git directory missing in: ${repoConfig.repoPath}`);
  }

  // Check readablity with git plumbing
  try {
    // Cheap query → returns nothing but fails when repo is corrupted
    await gitRevParseIsInsideWorkTree(repoConfig.repoPath);
  } catch (e) {
    throw new Error(`Git repo looks corrupted in ${repoConfig.repoPath}`);
  }

  // When remote repository, check if we can access it (e.g., via GitHub API)
  if (repoConfig.use === 'remote') {
    if (!repoConfig.remoteUrl) {
      throw new Error(`Remote URL is not defined for repository at ${repoConfig.repoPath}`);
    }

    try {
      await gitLsRemote(repoConfig.repoPath, repoConfig.remoteUrl);
    } catch (e) {
      throw new Error(`Failed to access remote repository at ${repoConfig.remoteUrl}`);
    }
  }
}