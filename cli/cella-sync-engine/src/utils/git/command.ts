import { exec, execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

const execAsync = promisify(exec);

export async function runGitCommand(command: string, repoPath: string): Promise<string> {
  const { stdout } = await execAsync(`git -C ${repoPath} ${command}`);
  return stdout.trim();
}

export async function gitCheckout(repoPath: string, branchName: string): Promise<string> {
  return runGitCommand(`checkout ${branchName}`, repoPath);
}

export async function gitFetch(repoPath: string, remoteName: string): Promise<string> {
  return runGitCommand(`fetch ${remoteName}`, repoPath);
}

export async function gitMerge(repoPath: string, branchName: string): Promise<string> {
  return runGitCommand(`merge ${branchName}`, repoPath);
}

export async function gitAdd(repoPath: string, filePath: string): Promise<string> {
  return runGitCommand(`add "${filePath}"`, repoPath);
}

/**
 * Get all files in a branch recursively from a given repository path using the git tree.
 */
export async function gitLsTreeRecursive(repoPath: string, branchName: string): Promise<string> {
  return runGitCommand(`ls-tree -r ${branchName}`, repoPath);
}

/**
 * Get the full commit SHA of the last commit that modified a specific file on a given branch.
 */
export async function gitLastCommitShaForFile(repoPath: string, branchName: string, filePath: string): Promise<string> {
  return runGitCommand(`log -n 1 --format=%H ${branchName} -- "${filePath}"`, repoPath);
}

export async function gitLogFileHistory(repoPath: string, branchName: string, filePath: string): Promise<string> {
  const command = `log --format="%H|%aI" --follow ${branchName} -- "${filePath}"`;
  return runGitCommand(command, repoPath);
}

export async function gitCommit(repoPath: string, message: string, options?: { noVerify?: boolean }): Promise<string> {
  const noVerifyFlag = options?.noVerify ? '--no-verify' : '';
  return runGitCommand(`commit ${noVerifyFlag} -m "${message}"`, repoPath);
}

export async function gitShowFileAtCommit(repoPath: string, commitSha: string, filePath: string): Promise<string> {
  return runGitCommand(`show ${commitSha}:${filePath}`, repoPath);
}

/**
 * Runs `git merge-file --quiet ours base theirs` to check if the file can be auto-merged.
 *
 * @param oursPath - Path to "ours" file
 * @param basePath - Path to "base" file (common ancestor)
 * @param theirsPath - Path to "theirs" file
 */
export async function gitMergeFile(oursPath: string, basePath: string, theirsPath: string): Promise<void> {
  // Throws if merge conflicts occur (exit code 1)
  await execFileAsync('git', ['merge-file', '--quiet', oursPath, basePath, theirsPath]);
}
