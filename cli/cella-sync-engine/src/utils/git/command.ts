import { exec, execFile } from 'child_process';
import { promisify } from 'util';
import { existsSync } from 'fs';

const execFileAsync = promisify(execFile);
const execAsync = promisify(exec);

/**
 * Executes a Git command in a specific repository path and returns the trimmed stdout as a string.
 * This function runs the command asynchronously and will throw an error if the Git command fails.
 * 
 * @param command - The Git command to execute (e.g., 'status', 'checkout branch-name').
 *                   This should be the arguments string after `git`.
 * @param repoPath - The absolute or relative path to the Git repository.
 * @returns The stdout of the Git command, trimmed of leading and trailing whitespace.
 * @throws Will throw an error if the Git command fails.
 * 
 * @example
 * const output = await runGitCommand('status', '/path/to/repo');
 * console.log(output);
 * // Example output:
 * // On branch main
 * // Your branch is up to date with 'origin/main'.
 */
export async function runGitCommand(command: string, repoPath: string): Promise<string> {
  const { stdout } = await execAsync(`git -C ${repoPath} ${command}`);
  return stdout.trim();
}

/**
 * Checks out a specific branch in the given repository.
 * Throws an error if the branch does not exist or checkout fails.
 * 
 * @param repoPath - The file system path to the git repository
 * @param branchName - The name of the branch to check out
 * @returns The stdout from the git checkout command
 *
 * @example
 * await gitCheckout('/path/to/repo', 'feature/new-feature');
 */
export async function gitCheckout(repoPath: string, branchName: string): Promise<string> {
  return runGitCommand(`checkout ${branchName}`, repoPath);
}

/**
 * Fetches changes from a remote repository.
 * Throws an error if the remote does not exist or fetch fails.
 * 
 * @param repoPath - The file system path to the git repository
 * @param remoteName - The name of the remote to fetch from (e.g., 'origin')
 * @returns The stdout from the git fetch command
 *
 * @example
 * await gitFetch('/path/to/repo', 'origin');
 */
export async function gitFetch(repoPath: string, remoteName: string): Promise<string> {
  return runGitCommand(`fetch ${remoteName}`, repoPath);
}

/**
 * Merges the specified branch into the current branch.
 * 
 * @param repoPath - The file system path to the git repository
 * @param branchName - The name of the branch to merge into the current branch
 * @param options - Optional flags for the merge command
 *   - noCommit: If true, adds the --no-commit flag (merge staged but not committed)
 *   - noEdit: If true, adds the --no-edit flag (use default commit message)
 * @returns The stdout from the git merge command
 *
 * @example
 * await gitMerge('/path/to/repo', 'upstream/main', { noCommit: true, noEdit: true });
 */
export async function gitMerge(
  repoPath: string,
  branchName: string,
  options: { noCommit?: boolean, noEdit?: boolean } = {},
): Promise<string> {
  const noCommitFlag = options.noCommit ? '--no-commit' : '';
  const noEditFlag = options.noEdit ? '--no-edit' : '';
  return runGitCommand(`merge ${branchName} ${noEditFlag} ${noCommitFlag}`, repoPath);
}

/**
 * Stages a file for commit in the given repository.
 * Throws an error if the file does not exist or cannot be added.
 * 
 * @param repoPath - The file system path to the git repository
 * @param filePath - The path to the file to stage
 * @returns The stdout from the git add command
 *
 * @example
 * await gitAdd('/path/to/repo', 'src/index.ts');
 */
export async function gitAdd(repoPath: string, filePath: string): Promise<string> {
  return runGitCommand(`add "${filePath}"`, repoPath);
}

/**
 * Gets a list of files currently in conflict (unmerged) in the given repository.
 * Returns raw stdout from git (one file path per line).
 * 
 * @param repoPath - The file system path to the git repository
 * @returns A string containing newline-separated paths of unmerged files
 *
 * @example
 * const conflicts = await gitDiffUnmerged('/path/to/repo');
 * console.log(conflicts);
 */
export async function gitDiffUnmerged(repoPath: string): Promise<string> {
  return runGitCommand('diff --name-only --diff-filter=U', repoPath);
}

/** 
 * Gets a list of files staged for commit in the given repository.
 * Returns raw stdout from git (one file path per line).
 * 
 * @param repoPath - The file system path to the git repository
 * @returns A string containing newline-separated paths of staged files
 *
 * @example
 * const stagedFiles = await gitDiffCached('/path/to/repo');
 * console.log(stagedFiles);
 */
export async function gitDiffCached(repoPath: string): Promise<string> {
  return runGitCommand('diff --name-only --cached', repoPath);
}

/**
 * Lists all files in a branch recursively from the given repository path using git ls-tree.
 * 
 * @param repoPath - The file system path to the git repository
 * @param branchName - The name of the branch to list files from
 * @returns The stdout from the git ls-tree command showing all files in the branch
 *
 * @example
 * const files = await gitLsTreeRecursive('/path/to/repo', 'main');
 * console.log(files);
 */
export async function gitLsTreeRecursive(repoPath: string, branchName: string): Promise<string> {
  return runGitCommand(`ls-tree -r ${branchName}`, repoPath);
}

/**
 * Gets the output of `git ls-tree -r <commit>` for a given commit in the repository.
 * Lists all files present at the specified commit.
 * 
 * @param repoPath - The file system path to the git repository
 * @param commitSha - The SHA of the commit to list files from
 * @returns The stdout from the git ls-tree command, showing all files in the commit
 *
 * @example
 * const files = await gitLsTreeRecursiveAtCommit('/path/to/repo', 'abc123def456');
 * console.log(files);
 */
export async function gitLsTreeRecursiveAtCommit(repoPath: string, commitSha: string): Promise<string> {
  return runGitCommand(`ls-tree -r ${commitSha}`, repoPath);
}

/**
 * Gets the full commit SHA of the last commit that modified a specific file on a given branch.
 * 
 * @param repoPath - The file system path to the git repository
 * @param branchName - The name of the branch to check
 * @param filePath - The path to the file to check
 * @returns The full commit SHA of the last commit that modified the file
 *
 * @example
 * const lastCommitSha = await gitLastCommitShaForFile('/path/to/repo', 'main', 'src/index.ts');
 * console.log(lastCommitSha);
 */
export async function gitLastCommitShaForFile(repoPath: string, branchName: string, filePath: string): Promise<string> {
  return runGitCommand(`log -n 1 --format=%H ${branchName} -- "${filePath}"`, repoPath);
}

/**
 * Gets the commit history for a specific file on a given branch.
 * Returns raw stdout from git log, with one commit per line in the format: `<commit-sha>|<author-date>`.
 * Includes all renames due to the `--follow` flag.
 * 
 * @param repoPath - The file system path to the git repository
 * @param branchName - The name of the branch to check
 * @param filePath - The path to the file to check
 * @returns The stdout from the git log command showing the file's commit history
 *
 * @example
 * const history = await gitLogFileHistory('/path/to/repo', 'main', 'src/index.ts');
 * console.log(history);
 */
export async function gitLogFileHistory(repoPath: string, branchName: string, filePath: string): Promise<string> {
  const command = `log --format="%H|%aI" --follow ${branchName} -- "${filePath}"`;
  return runGitCommand(command, repoPath);
}

/**
 * Creates a new commit in the given repository.
 * 
 * @param repoPath - The file system path to the git repository
 * @param message - The commit message
 * @param options - Optional flags for the commit
 *  - noVerify: If true, adds the `--no-verify` flag to skip pre-commit hooks
 * @returns The stdout from the git commit command
 *
 * @example
 * await gitCommit('/path/to/repo', 'Update boilerplate', { noVerify: true });
 */
export async function gitCommit(
  repoPath: string,
  message: string,
  options?: { noVerify?: boolean }
): Promise<string> {
  const noVerifyFlag = options?.noVerify ? '--no-verify' : '';
  return runGitCommand(`commit ${noVerifyFlag} -m "${message}"`, repoPath);
}

/**
 * Gets the content of a file at a specific commit.
 * 
 * @param repoPath - The file system path to the git repository
 * @param commitSha - The SHA of the commit
 * @param filePath - The path to the file
 * @returns The stdout from the git show command, i.e., the file contents at that commit
 *
 * @example
 * const content = await gitShowFileAtCommit('/path/to/repo', 'abc123def456', 'src/index.ts');
 * console.log(content);
 */
export async function gitShowFileAtCommit(repoPath: string, commitSha: string, filePath: string): Promise<string> {
  return runGitCommand(`show ${commitSha}:${filePath}`, repoPath);
}

/**
 * Attempts to automatically merge three file versions using `git merge-file`.
 * 
 * Runs `git merge-file --quiet ours base theirs` to determine whether a file can be auto-merged.
 * Throws an error if merge conflicts occur (exit code 1).
 * 
 * @param oursPath - Path to the "ours" version of the file
 * @param basePath - Path to the common ancestor ("base") version of the file
 * @param theirsPath - Path to the "theirs" version of the file
 * 
 * @throws If merge conflicts occur (Git exits with code 1)
 * 
 * @example
 * await gitMergeFile('ours.txt', 'base.txt', 'theirs.txt');
 * // If no conflicts occur, the merged content is written to ours.txt
 */
export async function gitMergeFile(oursPath: string, basePath: string, theirsPath: string): Promise<void> {
  // Throws if merge conflicts occur (exit code 1)
  await execFileAsync('git', ['merge-file', '--quiet', oursPath, basePath, theirsPath]);
}

/**
 * Checks if a merge is currently in progress within the given repository.
 * 
 * @param repoPath - The file system path to the git repository
 * @returns `true` if a merge is in progress (i.e., `.git/MERGE_HEAD` exists), otherwise `false`
 * 
 * @example
 * if (isMergeInProgress('/path/to/repo')) {
 *   console.log('Merge in progress...');
 * }
 */
export function isMergeInProgress(repoPath: string): boolean {
  return existsSync(`${repoPath}/.git/MERGE_HEAD`);
}

/**
 * Checks out the "ours" version of a conflicted file during a merge.
 * This keeps your local branch’s version of the file.
 * 
 * @param repoPath - The file system path to the git repository
 * @param filePath - The path to the conflicted file
 * @returns The stdout from the git checkout command
 * 
 * @example
 * await gitCheckoutOursFilePath('/repo', 'src/config.ts');
 */
export function gitCheckoutOursFilePath(repoPath: string, filePath: string): Promise<string> {
  return runGitCommand(`checkout --ours ${filePath}`, repoPath);
}

/**
 * Checks out the "theirs" version of a conflicted file during a merge.
 * This takes the incoming branch’s version of the file.
 * 
 * @param repoPath - The file system path to the git repository
 * @param filePath - The path to the conflicted file
 * @returns The stdout from the git checkout command
 * 
 * @example
 * await gitCheckoutTheirsFilePath('/repo', 'src/config.ts');
 */
export function gitCheckoutTheirsFilePath(repoPath: string, filePath: string): Promise<string> {
  return runGitCommand(`checkout --theirs ${filePath}`, repoPath);
}

/**
 * Removes a file from the Git index (staging area) but keeps it in the working directory.
 * 
 * Useful for excluding specific files from a merge or un-staging deletions.
 * 
 * @param repoPath - The file system path to the git repository
 * @param filePath - The path to the file to unstage
 * @returns The stdout from the git rm command
 * 
 * @example
 * await gitRemoveFilePathFromCache('/repo', 'src/config.ts');
 */
export function gitRemoveFilePathFromCache(repoPath: string, filePath: string): Promise<string> {
  return runGitCommand(`rm --cached "${filePath}"`, repoPath);
}

/**
 * Removes a single untracked file or directory using `git clean -fd`.
 * 
 * @param repoPath - The file system path to the git repository
 * @param filePath - The untracked file or directory to remove
 * @returns The stdout from the git clean command
 * 
 * @example
 * await gitCleanUntrackedFile('/repo', 'temp/build.log');
 */
export async function gitCleanUntrackedFile(repoPath: string, filePath: string): Promise<string> {
  return runGitCommand(`clean -fd "${filePath}"`, repoPath);
}

/**
 * Removes all untracked files and directories from the working tree using `git clean -fd`.
 * ⚠️ This operation is destructive and cannot be undone.
 * 
 * @param repoPath - The file system path to the git repository
 * @returns The stdout from the git clean command
 * 
 * @example
 * await gitCleanAllUntrackedFiles('/repo');
 */
export async function gitCleanAllUntrackedFiles(repoPath: string): Promise<string> {
  return runGitCommand('clean -fd', repoPath);
}

/**
 * Restores a staged file to the state of the last commit (HEAD),
 * removing it from the staging area and overwriting the working tree version.
 * Equivalent to: `git restore --staged --source=HEAD --worktree -- <file>`
 * 
 * @param repoPath - The file system path to the git repository
 * @param filePath - The path to the staged file to restore
 * @returns The stdout from the git restore command
 * 
 * @example
 * await gitRestoreStagedFile('/repo', 'src/index.ts');
 */
export async function gitRestoreStagedFile(repoPath: string, filePath: string): Promise<string> {
  return runGitCommand(`restore --staged --source=HEAD --worktree -- "${filePath}"`, repoPath);
}