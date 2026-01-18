import { execFile } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

/**
 * Executes a Git command in a specific repository path and returns the trimmed stdout as a string.
 * This function runs the command asynchronously and will throw an error if the Git command fails.
 *
 * @param args - The Git command arguments to execute (e.g., ['status'], ['checkout', 'branch-name']).
 * @param repoPath - The absolute or relative path to the Git repository.
 * @param options - Optional settings for command execution.
 *    - skipEditor: If true, sets the GIT_EDITOR environment variable to true to skip any editor prompts.
 *    - maxBuffer: Maximum buffer size for stdout in bytes. Defaults to 50MB for handling large outputs from commands like `git log --name-only`.
 * @throws Will throw an error if the Git command fails.
 * @returns The stdout of the Git command, trimmed of leading and trailing whitespace.
 *
 * @example
 * const output = await runGitCommand(['status'], '/path/to/repo');
 * console.info(output);
 * // Example output:
 * // On branch main
 * // Your branch is up to date with 'origin/main'.
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

  // Default to 50MB buffer for large outputs (e.g., git log --name-only across many commits)
  const maxBuffer = options.maxBuffer ?? 50 * 1024 * 1024;

  const { stdout } = await execFileAsync('git', gitArgs, { env, maxBuffer });

  return stdout.trim();
}

/**
 * Checks out a specific branch in the given repository.
 * Throws an error if the branch does not exist or checkout fails.
 *
 * @param repoPath - The file system path to the git repository
 * @param branchName - The name of the branch to check out
 *
 * @returns The stdout from the git checkout command
 *
 * @example
 * await gitCheckout('/path/to/repo', 'feature/new-feature');
 */
export async function gitCheckout(repoPath: string, branchName: string): Promise<string> {
  return runGitCommand(['checkout', branchName], repoPath);
}

/**
 * Fetches changes from a remote repository.
 * Throws an error if the remote does not exist or fetch fails.
 *
 * @param repoPath - The file system path to the git repository
 * @param remoteName - The name of the remote to fetch from (e.g., 'origin')
 *
 * @returns The stdout from the git fetch command
 *
 * @example
 * await gitFetch('/path/to/repo', 'origin');
 */
export async function gitFetch(repoPath: string, remoteName: string): Promise<string> {
  return runGitCommand(['fetch', remoteName], repoPath);
}

/**
 * Merges the specified branch into the current branch.
 *
 * @param repoPath - The file system path to the git repository
 * @param branchName - The name of the branch to merge into the current branch
 * @param options - Optional flags for the merge command
 *   - noCommit: If true, adds the --no-commit flag (merge staged but not committed)
 *   - noEdit: If true, adds the --no-edit flag (use default commit message)
 *   - squash: If true, perform a squash merge
 *
 * @returns The stdout from the git merge command
 *
 * @example
 * await gitMerge('/path/to/repo', 'upstream/main', { squash: true, noEdit: true });
 */
export async function gitMerge(
  repoPath: string,
  branchName: string,
  options: {
    noCommit?: boolean;
    noEdit?: boolean;
    squash?: boolean;
    acceptTheirs?: boolean;
    allowUnrelatedHistories?: boolean;
  } = {},
): Promise<string> {
  const args = ['merge', branchName];

  if (options.squash) args.push('--squash');
  if (options.noEdit) args.push('--no-edit');
  if (options.noCommit) args.push('--no-commit');
  if (options.acceptTheirs) args.push('--strategy-option=theirs');
  if (options.allowUnrelatedHistories) args.push('--allow-unrelated-histories');

  return runGitCommand(args, repoPath);
}

/**
 * Stages a file for commit in the given repository.
 * Throws an error if the file does not exist or cannot be added.
 *
 * @param repoPath - The file system path to the git repository
 * @param filePath - The path to the file to stage
 *
 * @returns The stdout from the git add command
 *
 * @example
 * await gitAdd('/path/to/repo', 'src/index.ts');
 */
export async function gitAdd(repoPath: string, filePath: string): Promise<string> {
  return runGitCommand(['add', filePath], repoPath);
}

/**
 * Stages all files for commit in the given repository.
 *
 * @param repoPath - The file system path to the git repository
 *
 * @returns The stdout from the git add command
 */
export async function gitAddAll(repoPath: string): Promise<string> {
  return runGitCommand(['add', '-A'], repoPath);
}

/**
 * Gets a list of files currently in conflict (unmerged) in the given repository.
 * Returns raw stdout from git (one file path per line).
 *
 * @param repoPath - The file system path to the git repository
 *
 * @returns A string containing newline-separated paths of unmerged files
 *
 * @example
 * const conflicts = await gitDiffUnmerged('/path/to/repo');
 * console.info(conflicts);
 */
export async function gitDiffUnmerged(repoPath: string): Promise<string> {
  return runGitCommand(['diff', '--name-only', '--diff-filter=U'], repoPath);
}

/**
 * Gets a list of files staged for commit in the given repository.
 * Returns raw stdout from git (one file path per line).
 *
 * @param repoPath - The file system path to the git repository
 *
 * @returns A string containing newline-separated paths of staged files
 *
 * @example
 * const stagedFiles = await gitDiffCached('/path/to/repo');
 * console.info(stagedFiles);
 */
export async function gitDiffCached(repoPath: string): Promise<string> {
  return runGitCommand(['diff', '--name-only', '--cached'], repoPath);
}

/**
 * Lists all files in a branch recursively from the given repository path using git ls-tree.
 *
 * @param repoPath - The file system path to the git repository
 * @param branchName - The name of the branch to list files from
 *
 * @returns The stdout from the git ls-tree command showing all files in the branch
 *
 * @example
 * const files = await gitLsTreeRecursive('/path/to/repo', 'main');
 * console.info(files);
 */
export async function gitLsTreeRecursive(repoPath: string, branchName: string): Promise<string> {
  return runGitCommand(['ls-tree', '-r', branchName], repoPath);
}

/**
 * Gets the last commit SHA for all files in a single git log command.
 * Outputs format: commit SHA followed by list of files changed in that commit.
 * We parse this to build a map of filePath → lastCommitSha.
 *
 * @param repoPath - The file system path to the git repository
 * @param branchName - The name of the branch to check
 *
 * @returns A Map of file paths to their last commit SHA
 */
export async function gitLogAllFilesLastCommit(repoPath: string, branchName: string): Promise<Map<string, string>> {
  // Get all commits with their changed files in one command
  // Format: <commit-sha>\n<file1>\n<file2>\n\n<next-commit-sha>\n...
  const output = await runGitCommand(['log', '--format=%H', '--name-only', branchName], repoPath);

  const fileToCommit = new Map<string, string>();
  let currentCommit = '';

  for (const line of output.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // SHA-1 hashes are 40 hex characters
    if (/^[0-9a-f]{40}$/i.test(trimmed)) {
      currentCommit = trimmed;
    } else if (currentCommit && !fileToCommit.has(trimmed)) {
      // First occurrence of this file = its most recent commit
      fileToCommit.set(trimmed, currentCommit);
    }
  }

  return fileToCommit;
}

/**
 * Gets the full commit SHA of the last commit that modified a specific file on a given branch.
 *
 * @param repoPath - The file system path to the git repository
 * @param branchName - The name of the branch to check
 * @param filePath - The path to the file to check
 *
 * @returns The full commit SHA of the last commit that modified the file
 *
 * @example
 * const lastCommitSha = await gitLastCommitShaForFile('/path/to/repo', 'main', 'src/index.ts');
 * console.info(lastCommitSha);
 */
export async function gitLastCommitShaForFile(repoPath: string, branchName: string, filePath: string): Promise<string> {
  return runGitCommand(['log', '-n', '1', '--format=%H', branchName, '--', filePath], repoPath);
}

/**
 * Gets the commit history for a specific file on a given branch.
 * Returns raw stdout from git log, with one commit per line in the format: `<commit-sha>|<author-date>`.
 * Includes all renames due to the `--follow` flag.
 *
 * @param repoPath - The file system path to the git repository
 * @param branchName - The name of the branch to check
 * @param filePath - The path to the file to check
 *
 * @returns The stdout from the git log command showing the file's commit history
 *
 * @example
 * const history = await gitLogFileHistory('/path/to/repo', 'main', 'src/index.ts');
 * console.info(history);
 */
export async function gitLogFileHistory(repoPath: string, branchName: string, filePath: string): Promise<string> {
  const args = ['log', '--format=%H|%aI', '--follow', branchName, '--', filePath];

  return runGitCommand(args, repoPath);
}

/**
 * Creates a new commit in the given repository.
 *
 * @param repoPath - The file system path to the git repository
 * @param message - The commit message
 * @param options - Optional flags for the commit
 *  - noVerify: If true, adds the `--no-verify` flag to skip pre-commit hooks
 *
 * @returns The stdout from the git commit command
 *
 * @example
 * await gitCommit('/path/to/repo', 'Update upstream', { noVerify: true });
 */
export async function gitCommit(repoPath: string, message: string, options?: { noVerify?: boolean }): Promise<string> {
  const args = ['commit'];

  if (options?.noVerify) {
    args.push('--no-verify');
  }

  for (const line of message.split('\n')) {
    args.push('-m', line);
  }

  return runGitCommand(args, repoPath);
}

/**
 * Gets the content of a file at a specific commit.
 *
 * @param repoPath - The file system path to the git repository
 * @param commitSha - The SHA of the commit
 * @param filePath - The path to the file
 *
 * @returns The stdout from the git show command, i.e., the file contents at that commit
 *
 * @example
 * const content = await gitShowFileAtCommit('/path/to/repo', 'abc123def456', 'src/index.ts');
 * console.info(content);
 */
export async function gitShowFileAtCommit(repoPath: string, commitSha: string, filePath: string): Promise<string> {
  return runGitCommand(['show', `${commitSha}:${filePath}`], repoPath);
}

/**
 * Checks if a merge is currently in progress within the given repository.
 *
 * @param repoPath - The file system path to the git repository
 *
 * @returns `true` if a merge is in progress (i.e., `.git/MERGE_HEAD` exists), otherwise `false`
 *
 * @example
 * if (isMergeInProgress('/path/to/repo')) {
 *   console.info('Merge in progress...');
 * }
 */
export function isMergeInProgress(repoPath: string): boolean {
  return existsSync(`${repoPath}/.git/MERGE_HEAD`);
}

/**
 * Checks if a rebase is currently in progress within the given repository.
 *
 * @param repoPath - The file system path to the git repository
 *
 * @returns `true` if a rebase is in progress (i.e., `.git/rebase-apply` or `.git/rebase-merge` exists), otherwise `false`
 *
 * @example
 * if (isRebaseInProgress('/path/to/repo')) {
 *   console.info('Rebase in progress...');
 * }
 */
export function isRebaseInProgress(repoPath: string): boolean {
  const rebaseApply = join(repoPath, '.git/rebase-apply');
  const rebaseMerge = join(repoPath, '.git/rebase-merge');
  return existsSync(rebaseApply) || existsSync(rebaseMerge);
}

/**
 * Checks out the "ours" version of a conflicted file during a merge.
 * This keeps your local branch’s version of the file.
 *
 * @param repoPath - The file system path to the git repository
 * @param filePath - The path to the conflicted file
 *
 * @returns The stdout from the git checkout command
 *
 * @example
 * await gitCheckoutOursFilePath('/repo', 'src/config.ts');
 */
export function gitCheckoutOursFilePath(repoPath: string, filePath: string): Promise<string> {
  return runGitCommand(['checkout', '--ours', filePath], repoPath);
}

/**
 * Removes a file from the Git index (staging area) but keeps it in the working directory.
 *
 * Useful for excluding specific files from a merge or un-staging deletions.
 *
 * @param repoPath - The file system path to the git repository
 * @param filePath - The path to the file to unstage
 *
 * @returns The stdout from the git rm command
 *
 * @example
 * await gitRemoveFilePathFromCache('/repo', 'src/config.ts');
 */
export function gitRemoveFilePathFromCache(repoPath: string, filePath: string): Promise<string> {
  return runGitCommand(['rm', '--cached', filePath], repoPath);
}

/**
 * Removes a single untracked file or directory using `git clean -fd`.
 *
 * @param repoPath - The file system path to the git repository
 * @param filePath - The untracked file or directory to remove
 *
 * @returns The stdout from the git clean command
 *
 * @example
 * await gitCleanUntrackedFile('/repo', 'temp/build.log');
 */
export async function gitCleanUntrackedFile(repoPath: string, filePath: string): Promise<string> {
  return runGitCommand(['clean', '-fd', filePath], repoPath);
}

/**
 * Removes all untracked files and directories from the working tree using `git clean -fd`.
 * ⚠️ This operation is destructive and cannot be undone.
 *
 * @param repoPath - The file system path to the git repository
 *
 * @returns The stdout from the git clean command
 *
 * @example
 * await gitCleanAllUntrackedFiles('/repo');
 */
export async function gitCleanAllUntrackedFiles(repoPath: string): Promise<string> {
  return runGitCommand(['clean', '-fd'], repoPath);
}

/**
 * Restores a staged file to the state of the last commit (HEAD),
 * removing it from the staging area and overwriting the working tree version.
 * Equivalent to: `git restore --staged --source=HEAD --worktree -- <file>`
 *
 * @param repoPath - The file system path to the git repository
 * @param filePath - The path to the staged file to restore
 *
 * @returns The stdout from the git restore command
 *
 * @example
 * await gitRestoreStagedFile('/repo', 'src/index.ts');
 */
export async function gitRestoreStagedFile(repoPath: string, filePath: string): Promise<string> {
  return runGitCommand(['restore', '--staged', '--source=HEAD', '--worktree', '--', filePath], repoPath);
}

/**
 * Executes `git rev-list --count` to get the number of commits
 * that are in `sourceBranch` but not in `baseBranch`.
 *
 * @param repoPath - Absolute or relative path to the Git repository
 * @param sourceBranch - The branch to compare (e.g., feature branch)
 * @param baseBranch - The branch to compare against (e.g., main or development)
 *
 * @throws If the Git command fails
 * @returns The raw string output of `git rev-list --count`
 *
 * @example
 * const countStr = await gitRevListCount('/repo', 'feature', 'main');
 * console.info(countStr); // e.g., "5"
 */
export async function gitRevListCount(repoPath: string, sourceBranch: string, baseBranch: string): Promise<string> {
  return runGitCommand(['rev-list', '--count', `${baseBranch}..${sourceBranch}`], repoPath);
}

/**
 * Executes `git rev-parse --is-inside-work-tree` to check if the given repository path
 *
 * @param repoPath - Absolute or relative path to the Git repository
 *
 * @returns The raw string output of `git rev-parse`
 */
export async function gitRevParseIsInsideWorkTree(repoPath: string): Promise<string> {
  return runGitCommand(['rev-parse', '--is-inside-work-tree'], repoPath);
}

/**
 * Connects to a remote repository and lists references using `git ls-remote`.
 * @param repoPath - Absolute or relative path to the Git repository
 * @param remotePath - The path or URL of the remote to query (e.g., 'origin' or a URL)
 *
 * @returns The raw string output of `git ls-remote`
 */
export async function gitLsRemote(repoPath: string, remotePath: string): Promise<string> {
  return runGitCommand(['ls-remote', remotePath], repoPath);
}

/**
 * Executes `git status --porcelain` to get the status of the working tree.
 * @param repoPath - Absolute or relative path to the Git repository
 *
 * @returns The raw string output of `git status --porcelain`
 */
export async function gitStatusPorcelain(repoPath: string): Promise<string> {
  return runGitCommand(['status', '--porcelain'], repoPath);
}

/**
 * Pulls the latest changes from the specified branch of the origin remote.
 * @param repoPath - The file system path to the git repository
 * @param branchName - The name of the branch to pull from
 *
 * @returns The stdout from the git pull command
 *
 * @example
 * await gitPull('/path/to/repo', 'development');
 */
export async function gitPull(repoPath: string, branchName: string): Promise<string> {
  return runGitCommand(['pull', 'origin', branchName], repoPath);
}
