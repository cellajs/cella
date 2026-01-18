/**
 * Git branch and remote reference utilities.
 * Consolidated from branches.ts and remotes.ts.
 */
import { runGitCommand } from './command';

// ─────────────────────────────────────────────────────────────────────────────
// Branch Operations
// ─────────────────────────────────────────────────────────────────────────────

/** List all local branches in the repository. */
async function getLocalBranches(repoPath: string): Promise<string[]> {
  const output = await runGitCommand(['branch', '--format=%(refname:short)'], repoPath);
  return output
    .split('\n')
    .map((b) => b.trim())
    .filter(Boolean);
}

/** List all remote branches in the repository. */
async function getRemoteBranches(repoPath: string): Promise<string[]> {
  const output = await runGitCommand(['branch', '-r', '--format=%(refname:short)'], repoPath);
  return output
    .split('\n')
    .map((b) => b.trim())
    .filter(Boolean);
}

/**
 * Checks whether a specific local branch exists.
 *
 * @param repoPath - The file system path to the git repository
 * @param branchName - The name of the local branch to check
 * @returns True if the local branch exists, false otherwise
 */
export async function hasLocalBranch(repoPath: string, branchName: string): Promise<boolean> {
  const branches = await getLocalBranches(repoPath);
  return branches.includes(branchName);
}

/**
 * Checks whether a specific remote branch exists (e.g., origin/development).
 *
 * @param repoPath - The file system path to the git repository
 * @param remoteBranchName - The name of the remote branch to check (including remote prefix)
 * @returns True if the remote branch exists, false otherwise
 */
export async function hasRemoteBranch(repoPath: string, remoteBranchName: string): Promise<boolean> {
  const branches = await getRemoteBranches(repoPath);
  return branches.includes(remoteBranchName);
}

/**
 * Creates a new local branch if it does not exist.
 *
 * @param repoPath - The file system path to the git repository
 * @param branchName - The name of the branch to create
 * @param baseBranch - The branch or commit to base the new branch on (default: HEAD)
 */
export async function createBranchIfMissing(
  repoPath: string,
  branchName: string,
  baseBranch: string = 'HEAD',
): Promise<void> {
  const exists = await hasLocalBranch(repoPath, branchName);
  if (!exists) {
    await runGitCommand(['checkout', '-b', branchName, baseBranch], repoPath);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Remote Operations
// ─────────────────────────────────────────────────────────────────────────────

/** Retrieves the list of remote names configured for a given Git repository. */
async function getRemotes(repoPath: string): Promise<string[]> {
  const output = await runGitCommand(['remote'], repoPath);
  return output
    .split('\n')
    .map((r) => r.trim())
    .filter(Boolean);
}

/**
 * Checks whether a specific remote exists in the given Git repository.
 *
 * @param repoPath - The file system path to the Git repository
 * @param remoteName - The name of the remote to check
 * @returns True if the specified remote exists, false otherwise
 */
export async function hasRemote(repoPath: string, remoteName: string): Promise<boolean> {
  const remotes = await getRemotes(repoPath);
  if (!remoteName) return remotes.length > 0;
  return remotes.includes(remoteName);
}

/**
 * Adds a new remote to the specified Git repository.
 *
 * @param repoPath - The file system path to the Git repository
 * @param remoteName - The name of the remote to add (e.g., 'origin')
 * @param remoteUrl - The URL of the remote repository
 */
export async function addRemote(repoPath: string, remoteName: string, remoteUrl: string): Promise<void> {
  await runGitCommand(['remote', 'add', remoteName, remoteUrl], repoPath);
}

/** Sets the URL for an existing remote. */
export async function setRemoteUrl(repoPath: string, remoteName: string, remoteUrl: string): Promise<void> {
  await runGitCommand(['remote', 'set-url', remoteName, remoteUrl], repoPath);
}

/**
 * Retrieves the URL of a specific remote in the given Git repository.
 *
 * @param repoPath - The file system path to the Git repository
 * @param remoteName - The name of the remote (e.g., 'origin')
 * @returns The remote URL as a string, or null if the remote does not exist
 */
export async function getRemoteUrl(repoPath: string, remoteName: string): Promise<string | null> {
  const exists = await hasRemote(repoPath, remoteName);
  if (!exists) return null;
  const url = await runGitCommand(['remote', 'get-url', remoteName], repoPath);
  return url.trim();
}
