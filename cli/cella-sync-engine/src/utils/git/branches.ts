import { runGitCommand } from './command';

/**
 * List all local branches in the repository.
 * 
 * @param repoPath - The file system path to the git repository
 * 
 * @returns An array of local branch names
 */
export async function getLocalBranches(repoPath: string): Promise<string[]> {
  const output = await runGitCommand(`branch --format="%(refname:short)"`, repoPath);
  return output.split('\n').map(b => b.trim()).filter(Boolean);
}

/**
 * List all remote branches in the repository.
 * 
 * @param repoPath - The file system path to the git repository
 * 
 * @returns An array of remote branch names
 */
export async function getRemoteBranches(repoPath: string): Promise<string[]> {
  const output = await runGitCommand(`branch -r --format="%(refname:short)"`, repoPath);
  return output.split('\n').map(b => b.trim()).filter(Boolean);
}

/**
 * Checks whether a specific local branch exists.
 * 
 * @param repoPath - The file system path to the git repository
 * @param branchName - The name of the local branch to check
 * 
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
 * 
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
 * 
 * @returns A Promise that resolves when the branch is created or already exists
 */
export async function createBranchIfMissing(repoPath: string, branchName: string, baseBranch: string = 'HEAD'): Promise<void> {
  const exists = await hasLocalBranch(repoPath, branchName);
  if (!exists) {
    await runGitCommand(`checkout -b ${branchName} ${baseBranch}`, repoPath);
  }
}

/**
 * Pushes a branch to the specified remote if it does not already exist there.
 * 
 * @param repoPath - The file system path to the git repository
 * @param branchName - The name of the branch to push
 * @param remoteName - The name of the remote to push to (default: origin)
 * 
 * @returns A Promise that resolves when the branch is pushed or already exists on the remote
 */
export async function pushBranchIfMissing(repoPath: string, branchName: string, remoteName: string = 'origin'): Promise<void> {
  const remoteBranch = `${remoteName}/${branchName}`;
  const exists = await hasRemoteBranch(repoPath, remoteBranch);
  if (!exists) {
    await runGitCommand(`push ${remoteName} ${branchName}`, repoPath);
  }
}