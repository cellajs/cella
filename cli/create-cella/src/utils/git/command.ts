import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/**
 * Executes a Git command in a specific repository path and returns the trimmed stdout.
 * Uses execFile for safety (no shell injection) aligned with sync package pattern.
 *
 * @param args - The Git command arguments to execute (e.g., ['status'], ['checkout', 'branch-name']).
 * @param repoPath - The path to the Git repository.
 * @param options - Optional settings for command execution.
 * @returns The stdout of the Git command, trimmed of leading and trailing whitespace.
 */
export async function runGitCommand(
  args: string[],
  repoPath: string,
  options: { skipEditor?: boolean; maxBuffer?: number } = {},
): Promise<string> {
  const gitArgs = repoPath ? ['-C', repoPath, ...args] : args;

  const env = {
    ...process.env,
    ...(options.skipEditor ? { GIT_EDITOR: 'true' } : {}),
  };

  // Default to 10MB buffer for typical outputs
  const maxBuffer = options.maxBuffer ?? 10 * 1024 * 1024;

  const { stdout } = await execFileAsync('git', gitArgs, { env, maxBuffer });

  return stdout.trim();
}

/**
 * Initializes a new Git repository in the specified directory.
 */
export async function gitInit(repoPath: string): Promise<string> {
  return runGitCommand(['init'], repoPath);
}

/**
 * Stages all files in the repository.
 */
export async function gitAddAll(repoPath: string): Promise<string> {
  return runGitCommand(['add', '.'], repoPath);
}

/**
 * Creates a commit with the specified message.
 */
export async function gitCommit(repoPath: string, message: string): Promise<string> {
  return runGitCommand(['commit', '-m', message], repoPath);
}

/**
 * Creates a new branch with the specified name.
 */
export async function gitBranch(repoPath: string, branchName: string): Promise<string> {
  return runGitCommand(['branch', branchName], repoPath);
}

/**
 * Checks out the specified branch.
 */
export async function gitCheckout(repoPath: string, branchName: string): Promise<string> {
  return runGitCommand(['checkout', branchName], repoPath);
}

/**
 * Gets the URL of a remote.
 */
export async function gitRemoteGetUrl(repoPath: string, remoteName: string): Promise<string> {
  return runGitCommand(['remote', 'get-url', remoteName], repoPath);
}

/**
 * Adds a new remote.
 */
export async function gitRemoteAdd(repoPath: string, remoteName: string, remoteUrl: string): Promise<string> {
  return runGitCommand(['remote', 'add', remoteName, remoteUrl], repoPath);
}

/**
 * Removes a remote.
 */
export async function gitRemoteRemove(repoPath: string, remoteName: string): Promise<string> {
  return runGitCommand(['remote', 'remove', remoteName], repoPath);
}
