import { runGitCommand } from './command';

/**
 * Returns the list of git remotes for a given repo path.
 */
export async function getRemotes(repoPath: string): Promise<string[]> {
  const output = await runGitCommand('remote', repoPath);
  return output.split('\n').map(r => r.trim()).filter(Boolean);
}

/**
 * Checks if a remote with the given name exists.
 */
export async function hasRemote(repoPath: string, remoteName: string): Promise<boolean> {
  const remotes = await getRemotes(repoPath);
  if (!remoteName) return remotes.length > 0; // If no remoteName is provided, check if there are any remotes
  return remotes.includes(remoteName);
}

/**
 * Adds a new remote to the repo.
 */
export async function addRemote(repoPath: string, remoteName: string, remoteUrl: string): Promise<void> {
  await runGitCommand(`remote add ${remoteName} ${remoteUrl}`, repoPath);
}

/**
 * Adds a remote only if it doesn’t already exist.
 */
export async function addRemoteIfMissing(repoPath: string, remoteName: string, remoteUrl: string): Promise<void> {
  const exists = await hasRemote(repoPath, remoteName);
  if (!exists) {
    await addRemote(repoPath, remoteName, remoteUrl);
  }
}