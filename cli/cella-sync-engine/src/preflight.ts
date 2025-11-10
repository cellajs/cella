import path from "node:path";
import pc from "picocolors";

import { boilerplateConfig, forkConfig, behaviorConfig } from "./config/index";
import { RepoConfig } from "./types/config";
import { isDirectory } from "./utils/files";
import { gitCheckout, gitLsRemote, gitRevParseIsInsideWorkTree, isMergeInProgress, isRebaseInProgress } from "./utils/git/command";
import { addRemote, getRemoteUrl, hasRemote, setRemoteUrl } from "./utils/git/remotes";
import { createBranchIfMissing, hasLocalBranch } from "./utils/git/branches";
import { isRepoClean } from "./utils/git/helpers";

/**
 * Preflight checks before running the sync process.
 * For now we only support the flow: Boilerplate → Fork (via sync branch).
 * 
 * - Ensures boilerplate repository settings are correct.
 * - Ensures fork repository settings are correct.
 * - Validates connectivity to both repositories.
 * - Prepare repositories by ensuring remotes and branches exist.
 */
export async function preflight() {
  console.log(pc.cyan("↻ Running preflight checks..."));

  // Basic configuration checks
  checkBoilerplateRepo();
  checkForkRepo();

  // Validate connectivity to repositories (local or remote)
  await validateRepositoryConnectivity(boilerplateConfig);
  await validateRepositoryConnectivity(forkConfig);

  // Prepare repositories (branches, remotes, etc)
  await prepareRepositories();
}

/**
 * Check the boilerplate repository configuration.
 * Throws an error if any required configuration is missing.
 */
function checkBoilerplateRepo() {
  // `branch` must be set
  if (!boilerplateConfig.branch) {
    throw new Error("Boilerplate `branch` is not set.");
  }

  // `remoteName` must be set
  if (!boilerplateConfig.remoteName) {
    throw new Error("Boilerplate `remoteName` is not set.");
  }

  if (boilerplateConfig.use === 'local') {
    // `repoPath` must be set for `local` use
    if (!boilerplateConfig.repoPath) {
      throw new Error("Boilerplate `repoPath` is not set for `local` use.");
    }
  }

  if (boilerplateConfig.use === 'remote') {
    // `owner` must be set for `remote` use
    if (!boilerplateConfig.owner) {
      throw new Error("Boilerplate `owner` is not set for `remote` use.");
    }

    // `repo` must be set for `remote` use
    if (!boilerplateConfig.repo) {
      throw new Error("Boilerplate `repo` is not set for `remote` use.");
    }

    // `remoteUrl` must be set for `remote` use
    if (!boilerplateConfig.remoteUrl) {
      throw new Error("Boilerplate `remoteUrl` is not set for `remote` use.");
    }
  }

  console.log(pc.green("✓ Boilerplate repository configuration is valid."));
}

/**
 * Check the fork repository configuration.
 * Throws an error if any required configuration is missing.
 */
function checkForkRepo() {
  // `branch` must be set
  if (!forkConfig.branch) {
    throw new Error("Fork `branch` is not set.");
  }

  // `targetBranch` must be set
  if (!forkConfig.targetBranch) {
    throw new Error("Fork `targetBranch` is not set.");
  }

  // `use` must be 'local' for now
  if (forkConfig.use !== 'local') {
    throw new Error("Fork `use` must be 'local' for now.");
  }

  if (forkConfig.use === 'local') {
    // `repoPath` must be set for `local` use
    if (!forkConfig.repoPath) {
      throw new Error("Fork `repoPath` is not set for `local` use.");
    }
    if (forkConfig.use !== 'local') {
      throw new Error("Fork `use` must be 'local' for now.");
    }

    console.log(pc.green("✓ Fork repository configuration is valid."));
  }
}

/**
 * Validates connectivity to the specified repository.
 * @param repoConfig - The repository configuration
 * @throws If connectivity validation fails
 *
 * @example
 * await validateRepositoryConnectivity(boilerplateConfig);
 */
async function validateRepositoryConnectivity(repoConfig: RepoConfig) {
  const isFork = repoConfig === forkConfig ? true : false;

  // When local reposoitory, check if path exists and if its a git repository
  if (repoConfig.use === 'local') {
    await ensureGitRepo(repoConfig.repoPath);
  }

  // When remote repository, check if we can access it (e.g., via GitHub API)
  if (repoConfig.use === 'remote') {
    await ensureGitRemoteRepo(repoConfig);
  }

  console.log(pc.green(`✓ ${isFork ? "Fork" : "Boilerplate"} repository connectivity validated.`));
}

/**
 * Ensures that the specified path is a valid Git repository.
 * Checks for the existence of the directory, presence of a `.git` folder,
 * and verifies that Git can read the repository.
 *
 * @param repoPath - The path to the Git repository
 * @throws If the path does not exist, is not a directory, lacks a `.git` folder, or is corrupted
 *
 * @example
 * await ensureGitRepo('/path/to/repo');
 */
async function ensureGitRepo(repoPath: string): Promise<void> {
  // Folder must be a directory
  if (!(await isDirectory(repoPath))) {
    throw new Error(`${repoPath} is not a directory`);
  }

  // Directory must contain a .git folder
  if (!(await isDirectory(path.join(repoPath, ".git")))) {
    throw new Error(`.git directory missing in: ${repoPath}`);
  }

  // Check readablity with git plumbing
  try {
    // cheap query — returns nothing but fails when repo is corrupted
    await gitRevParseIsInsideWorkTree(repoPath);
  } catch (e) {
    throw new Error(`Git repo looks corrupted in ${repoPath}`);
  }
}

/**
 * Validates connectivity to a remote Git repository.
 * @param repoConfig - The repository configuration
 * @throws If connectivity validation fails
 *
 * @example
 * await ensureGitRemoteRepo(boilerplateConfig);
 */
async function ensureGitRemoteRepo(repoConfig: RepoConfig): Promise<void> {
  if (!repoConfig.remoteUrl) {
    throw new Error(`Remote URL is not defined for repository at ${repoConfig.repoPath}`);
  }

  try {
    await gitLsRemote('', repoConfig.remoteUrl);
  } catch (e) {
    throw new Error(`Failed to access remote repository at ${repoConfig.remoteUrl}`);
  }
}

/**
 * Prepare repositories by ensuring remotes and branches exist.
 * - If remotes already exist, check if remote URLs match configuration.
 * - If remotes do not exist, add them.
 * - If branches do not exist, create them.
 *
 * @example
 * await prepareRepositories();
 */
async function prepareRepositories() {
  const remoteUrl = boilerplateConfig.use === 'remote' ? boilerplateConfig.remoteUrl! : boilerplateConfig.repoPath!;

  // Check if boilerplate is added as remote to fork
  if (await hasRemote(forkConfig.repoPath, boilerplateConfig.remoteName)) {
    // Verify remote URL matches configuration
    const currentUrl = await getRemoteUrl(forkConfig.repoPath, boilerplateConfig.remoteName);
    if (currentUrl !== remoteUrl) {
      if (behaviorConfig.onRemoteWrongUrl === 'overwrite') {
        // Update remote URL to match configuration
        await setRemoteUrl(forkConfig.repoPath, boilerplateConfig.remoteName, remoteUrl!);
      } else {
        throw new Error(`Remote URL for '${boilerplateConfig.remoteName}' in fork does not match boilerplate configuration.`);
      }
    }
  } else {
    // Add boilerplate as remote to fork
    await addRemote(forkConfig.repoPath, boilerplateConfig.remoteName, remoteUrl!);
  }

  // Check if current stage of fork is clean
  if (!await isRepoClean(forkConfig.repoPath)) {
    throw new Error(`Fork repository at ${forkConfig.repoPath} has uncommitted changes. Please commit or stash them before proceeding.`);
  }

  if (isMergeInProgress(forkConfig.repoPath)) {
    throw new Error(`Fork repository at ${forkConfig.repoPath} has a merge in progress. Please resolve it before proceeding.`);
  }

  if (isRebaseInProgress(forkConfig.repoPath)) {
    throw new Error(`Fork repository at ${forkConfig.repoPath} has a rebase in progress. Please resolve it before proceeding.`);
  }

  // Check out target branch in fork and ensure it's clean
  await gitCheckout(forkConfig.repoPath, forkConfig.targetBranch);
  if (!await isRepoClean(forkConfig.repoPath)) {
    throw new Error(`Fork repository at ${forkConfig.repoPath} has uncommitted changes after checking out target branch. Please commit or stash them before proceeding.`);
  }

  if (isMergeInProgress(forkConfig.repoPath)) {
    throw new Error(`Fork repository at ${forkConfig.repoPath} has a merge in progress after checking out target branch. Please resolve it before proceeding.`);
  }

  if (isRebaseInProgress(forkConfig.repoPath)) {
    throw new Error(`Fork repository at ${forkConfig.repoPath} has a rebase in progress after checking out target branch. Please resolve it before proceeding.`);
  }

  // Check if sync branch exists in fork, if not create it
  await createBranchIfMissing(forkConfig.repoPath, forkConfig.branch);

  // Check if sync branch is clean
  await gitCheckout(forkConfig.repoPath, forkConfig.branch);
  if (!await isRepoClean(forkConfig.repoPath)) {
    throw new Error(`Fork repository at ${forkConfig.repoPath} has uncommitted changes after checking out sync branch. Please commit or stash them before proceeding.`);
  }

  // If boilerplate is local, ensure its branch exists and is clean
  if (boilerplateConfig.use === 'local') {
    if (!await hasLocalBranch(boilerplateConfig.repoPath!, boilerplateConfig.branch)) {
      throw new Error(`Boilerplate branch '${boilerplateConfig.branch}' does not exist in local boilerplate repository at ${boilerplateConfig.repoPath}.`);
    }

    // if (!await isRepoClean(boilerplateConfig.repoPath)) {
    //   throw new Error(`Boilerplate repository at ${boilerplateConfig.repoPath} has uncommitted changes. Please commit or stash them before proceeding.`);
    // }

    // if (isMergeInProgress(boilerplateConfig.repoPath)) {
    //   throw new Error(`Boilerplate repository at ${boilerplateConfig.repoPath} has a merge in progress. Please resolve it before proceeding.`);
    // }

    // if (isRebaseInProgress(boilerplateConfig.repoPath)) {
    //   throw new Error(`Boilerplate repository at ${boilerplateConfig.repoPath} has a rebase in progress. Please resolve it before proceeding.`);
    // }

    // await gitCheckout(boilerplateConfig.repoPath, boilerplateConfig.branch);

    // if (!await isRepoClean(boilerplateConfig.repoPath)) {
    //   throw new Error(`Boilerplate repository at ${boilerplateConfig.repoPath} has uncommitted changes after checking out branch '${boilerplateConfig.branch}'. Please commit or stash them before proceeding.`);
    // }

    // if (isMergeInProgress(boilerplateConfig.repoPath)) {
    //   throw new Error(`Boilerplate repository at ${boilerplateConfig.repoPath} has a merge in progress after checking out branch '${boilerplateConfig.branch}'. Please resolve it before proceeding.`);
    // }

    // if (isRebaseInProgress(boilerplateConfig.repoPath)) {
    //   throw new Error(`Boilerplate repository at ${boilerplateConfig.repoPath} has a rebase in progress after checking out branch '${boilerplateConfig.branch}'. Please resolve it before proceeding.`);
    // }
  }

  console.log(pc.green("✓ Repositories are prepared."));
}