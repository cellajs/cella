import { runGitCommand } from './command';

/**
 * List all local branches in the repository.
 */
export async function getLocalBranches(repoPath: string): Promise<string[]> {
  const output = await runGitCommand(`branch --format="%(refname:short)"`, repoPath);
  return output.split('\n').map(b => b.trim()).filter(Boolean);
}

/**
 * List all remote branches in the repository.
 */
export async function getRemoteBranches(repoPath: string): Promise<string[]> {
  const output = await runGitCommand(`branch -r --format="%(refname:short)"`, repoPath);
  return output.split('\n').map(b => b.trim()).filter(Boolean);
}

/**
 * Checks whether a specific local branch exists.
 */
export async function hasLocalBranch(repoPath: string, branchName: string): Promise<boolean> {
  const branches = await getLocalBranches(repoPath);
  return branches.includes(branchName);
}

/**
 * Checks whether a specific remote branch exists (e.g., origin/development).
 */
export async function hasRemoteBranch(repoPath: string, remoteBranchName: string): Promise<boolean> {
  const branches = await getRemoteBranches(repoPath);
  return branches.includes(remoteBranchName);
}

/**
 * Creates a new local branch if it does not exist.
 */
export async function createBranchIfMissing(repoPath: string, branchName: string, baseBranch: string = 'HEAD'): Promise<void> {
  const exists = await hasLocalBranch(repoPath, branchName);
  if (!exists) {
    await runGitCommand(`checkout -b ${branchName} ${baseBranch}`, repoPath);
  }
}

/**
 * Pushes a branch to the specified remote if it does not already exist there.
 */
export async function pushBranchIfMissing(repoPath: string, branchName: string, remoteName: string = 'origin'): Promise<void> {
  const remoteBranch = `${remoteName}/${branchName}`;
  const exists = await hasRemoteBranch(repoPath, remoteBranch);
  if (!exists) {
    await runGitCommand(`push ${remoteName} ${branchName}`, repoPath);
  }
}