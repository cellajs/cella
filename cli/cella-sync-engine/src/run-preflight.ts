import path from "node:path";
import pc from "picocolors";
import yoctoSpinner from 'yocto-spinner';

import { boilerplateConfig, forkConfig, behaviorConfig } from "./config/index";
import { RepoConfig } from "./types/config";
import { isDirectory } from "./utils/files";
import { gitCheckout, gitFetch, gitLsRemote, gitPull, gitRevParseIsInsideWorkTree, isMergeInProgress, isRebaseInProgress } from "./utils/git/command";
import { addRemote, getRemoteUrl, hasRemote, setRemoteUrl } from "./utils/git/remotes";
import { createBranchIfMissing, hasLocalBranch, hasRemoteBranch } from "./utils/git/branches";
import { isRepoClean } from "./utils/git/helpers";
import { handleMerge } from "./modules/git/handle-merge";

/**
 * Checklist item for repository configuration validation.
 * - `prop`: The property name to check.
 * - `required`: Whether the property is always required.
 * - `requiredIf`: A function that determines if the property is required based on the config.
 * - `allowedValues`: An array of allowed values for the property.
 */
const boilerplateConfigChecklist = [
  { prop: 'branch', required: true },
  { prop: 'remoteName', required: true },
  { prop: 'use', required: true },
  { prop: 'repoPath', required: true },
  { prop: 'remoteUrl', requiredIf: (config: RepoConfig) => config.use === 'remote' },
];

const forkConfigChecklist = [
  { prop: 'branch', required: true },
  { prop: 'targetBranch', required: true },
  { prop: 'use', required: true, allowedValues: ['local'] },
  { prop: 'repoPath', requiredIf: (config: RepoConfig) => config.use === 'local' },
];

/**
 * Preflight checks before running any scripts.
 * For now we only support the flow: Boilerplate → Fork (via sync branch).
 * 
 * - Ensures boilerplate repository settings are correct.
 * - Ensures fork repository settings are correct.
 * - Validates connectivity to both repositories.
 * - Prepare repositories by ensuring remotes and branches exist.
 */
export async function runPreflight() {
  const spinner = yoctoSpinner({ text: "Running preflight checks..." });
  spinner.start();

  // Basic configuration checks
  checkConfig(boilerplateConfig, boilerplateConfigChecklist);
  checkConfig(forkConfig, forkConfigChecklist);

  // Validate connectivity to repositories (local or remote)
  await validateRepositoryConnectivity(boilerplateConfig);
  await validateRepositoryConnectivity(forkConfig);

  // Ensure boilerplate remote is added to fork
  await addBoilerplateRemoteToFork();

  // Ensure fork repository is clean (both working directory and target branch)
  await ensureCleanWorkingDirectory(forkConfig.repoPath);
  await ensureCleanWorkingDirectory(forkConfig.repoPath, forkConfig.targetBranch);

  // Check if sync-branch exists in fork, if not create it, then ensure it's clean
  await createBranchIfMissing(forkConfig.repoPath, forkConfig.branch);
  await ensureCleanWorkingDirectory(forkConfig.repoPath, forkConfig.branch);

  // If boilerplate is local, also ensure working directory is clean
  if (boilerplateConfig.use === 'local') {
    await ensureCleanWorkingDirectory(boilerplateConfig.repoPath);
    await ensureCleanWorkingDirectory(boilerplateConfig.repoPath, boilerplateConfig.branch);
  }

  // Ensure latest changes are fetched for both repositories and left behind in a clean state
  await ensureLatestChangesFetched(boilerplateConfig);
  await ensureLatestChangesFetched(forkConfig);

  // Merge fork target branch into sync branch to ensure it's up to date
  await handleMerge(forkConfig.repoPath, forkConfig.branch, forkConfig.targetBranch, null);
  await ensureCleanWorkingDirectory(forkConfig.repoPath, forkConfig.branch, { skipCheckout: true });

  spinner.stop();
  console.log(pc.green("✔ Preflight checks passed.\n"));
}

/**
 * Checks the repository configuration against a checklist.
 * @param repoConfig - The repository configuration
 * @param checklist - The checklist of properties to validate
 * @throws If any required property is missing or has an invalid value
 *
 * @example
 * checkConfig(boilerplateConfig, boilerplateConfigChecklist);
 */
function checkConfig(repoConfig: RepoConfig, checklist: any[]) {
  for (const item of checklist) {
    const { prop, required, requiredIf, allowedValues } = item;

    // Check if property is required
    const isRequired = required || (requiredIf && requiredIf(repoConfig));

    if (isRequired && !(repoConfig as any)[prop]) {
      throw new Error(`Repository \`${prop}\` is not set.`);
    }

    // Check if property value is allowed
    if (allowedValues && (repoConfig as any)[prop] && !allowedValues.includes((repoConfig as any)[prop])) {
      throw new Error(`Repository \`${prop}\` has an invalid value: ${(repoConfig as any)[prop]}. Allowed values are: ${allowedValues.join(', ')}.`);
    }
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

/**
 * Adds the boilerplate repository as a remote to the fork repository if not already added.
 * - If the remote already exists, checks if the URL matches the configuration.
 * - If the URL does not match and behaviorConfig.onRemoteWrongUrl is 'overwrite', updates the URL.
 * - If the URL does not match and behaviorConfig.onRemoteWrongUrl is not 'overwrite', throws an error.
 */
async function addBoilerplateRemoteToFork() {
  const remoteUrl = boilerplateConfig.use === 'remote' ? boilerplateConfig.remoteUrl! : boilerplateConfig.repoPath!;

  // If boilerplate is not added as remote to fork, add it
  if (!await hasRemote(forkConfig.repoPath, boilerplateConfig.remoteName)) {
    await addRemote(forkConfig.repoPath, boilerplateConfig.remoteName, remoteUrl!);
    return;
  }

  // Check remote URL matches configuration
  const currentUrl = await getRemoteUrl(forkConfig.repoPath, boilerplateConfig.remoteName);
  if (currentUrl === remoteUrl) {
    return;
  }

  // Update remote URL to match configuration
  if (behaviorConfig.onRemoteWrongUrl === 'overwrite') {
    await setRemoteUrl(forkConfig.repoPath, boilerplateConfig.remoteName, remoteUrl!);
    return;
  }

  throw new Error(`Remote URL for '${boilerplateConfig.remoteName}' in fork does not match boilerplate configuration.`);
}

/**
 * Ensures the working directory of the repository is clean.
 * - Optionally checks out a target branch before validation.
 * - Throws an error if there are uncommitted changes, or if a merge or rebase is in progress.
 * @param repoPath - The file system path to the repository
 * @param targetBranch - The branch to check out before validation (optional)
 */
async function ensureCleanWorkingDirectory(repoPath: string, targetBranch?: string, options?: { skipCheckout?: boolean }) {
  // Determine the location description for error messages
  const locationDescription = targetBranch ? `Branch '${targetBranch}' in repository at ${repoPath}` : `repository at ${repoPath}`;

  if (targetBranch && !options?.skipCheckout) {
    if (!await hasLocalBranch(repoPath, targetBranch)) {
      throw new Error(`${locationDescription} does not exist.`);
    }

    await gitCheckout(repoPath, targetBranch);
  }

  // Check for uncommitted changes
  if (!await isRepoClean(repoPath)) {
    throw new Error(`${locationDescription} has uncommitted changes. Please commit or stash them before proceeding.`);
  }

  // Check for ongoing merge
  if (isMergeInProgress(repoPath)) {
    throw new Error(`${locationDescription} has a merge in progress. Please resolve it before proceeding.`);
  }

  // Check for ongoing rebase
  if (isRebaseInProgress(repoPath)) {
    throw new Error(`${locationDescription} has a rebase in progress. Please resolve it before proceeding.`);
  }
}

/**
 * Ensures the latest changes are fetched for the repository.
 * - For remote repositories, performs a git fetch.
 * - For local repositories, pulls the latest changes for the main and target branches.
 * Also ensures the working directory is clean after pulling.
 * @param repoConfig - The repository configuration
 */
async function ensureLatestChangesFetched(repoConfig: RepoConfig) {
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
    await ensureCleanWorkingDirectory(repoPath, branchName, { skipCheckout: true });
    return;
  }

  if (behaviorConfig.onMissingUpstream === 'error') {
    throw new Error(`Upstream remote for branch '${branchName}' is missing in repository at ${repoPath}.`);
  }
}