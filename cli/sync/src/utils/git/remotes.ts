import { runGitCommand } from './command';

/**
 * Retrieves the list of remote names configured for a given Git repository.
 * Internally runs `git remote` and splits the output by line.
 */
async function getRemotes(repoPath: string): Promise<string[]> {
  const output = await runGitCommand(['remote'], repoPath);
  return output
    .split('\n')
    .map((r) => r.trim())
    .filter(Boolean);
}

/**
 * Checks whether a specific remote exists in the given Git repository.
 * If no remote name is provided, it returns `true` if *any* remotes exist.
 *
 * @param repoPath - The file system path to the Git repository
 * @param remoteName - The name of the remote to check (optional)
 *
 * @returns `true` if the specified remote exists (or if any exist when `remoteName` is omitted), otherwise `false`
 *
 * @example
 * const hasOrigin = await hasRemote('/repo', 'origin');
 * console.info(hasOrigin); // true
 */
export async function hasRemote(repoPath: string, remoteName: string): Promise<boolean> {
  const remotes = await getRemotes(repoPath);

  // If no remoteName is provided, check if there are any remotes
  if (!remoteName) {
    return remotes.length > 0;
  }

  return remotes.includes(remoteName);
}

/**
 * Adds a new remote to the specified Git repository.
 * Internally runs `git remote add <remoteName> <remoteUrl>`.
 *
 * @param repoPath - The file system path to the Git repository
 * @param remoteName - The name of the remote to add (e.g., `'origin'`)
 * @param remoteUrl - The URL of the remote repository
 *
 * @throws If the remote already exists or Git returns an error
 * @returns A promise that resolves when the remote is added
 *
 * @example
 * await addRemote('/repo', 'origin', 'https://github.com/user/project.git');
 */
export async function addRemote(repoPath: string, remoteName: string, remoteUrl: string): Promise<void> {
  await runGitCommand(['remote', 'add', remoteName, remoteUrl], repoPath);
}

export async function setRemoteUrl(repoPath: string, remoteName: string, remoteUrl: string): Promise<void> {
  await runGitCommand(['remote', 'set-url', remoteName, remoteUrl], repoPath);
}

/**
 * Retrieves the URL of a specific remote in the given Git repository.
 *
 * @param repoPath - The file system path to the Git repository
 * @param remoteName - The name of the remote (e.g., 'origin')
 *
 * @returns The remote URL as a string, or `null` if the remote does not exist
 *
 * @example
 * const url = await getRemoteUrl('/repo', 'origin');
 * console.info(url); // 'https://github.com/user/project.git'
 */
export async function getRemoteUrl(repoPath: string, remoteName: string): Promise<string | null> {
  const exists = await hasRemote(repoPath, remoteName);
  if (!exists) return null;

  const url = await runGitCommand(['remote', 'get-url', remoteName], repoPath);
  return url.trim();
}
