import fs from 'node:fs';
import git from 'isomorphic-git';

/**
 * Git helpers backed by isomorphic-git (pure JS) instead of shelling out to the
 * `git` binary. This keeps `create-cella` free of `child_process` (no shell access)
 * and removes any dependency on the user's global git config — the initial commit
 * uses an explicit author, so scaffolding never fails with "Author identity unknown".
 */

/** Author used for the scaffold's initial commit (users re-author their own commits later). */
const INITIAL_AUTHOR = { name: 'cella', email: 'info@cellajs.com' } as const;

/**
 * Initializes a new Git repository in the specified directory.
 */
export async function gitInit(repoPath: string): Promise<void> {
  await git.init({ fs, dir: repoPath, defaultBranch: 'main' });
}

/**
 * Stages all files in the repository (respects `.gitignore`).
 */
export async function gitAddAll(repoPath: string): Promise<void> {
  await git.add({ fs, dir: repoPath, filepath: '.' });
}

/**
 * Creates a commit with the specified message and returns the commit SHA.
 */
export async function gitCommit(repoPath: string, message: string): Promise<string> {
  return git.commit({ fs, dir: repoPath, message, author: INITIAL_AUTHOR });
}

/**
 * Gets the URL of a remote. Throws when the remote does not exist (mirrors
 * `git remote get-url` failing) so callers can detect a missing remote.
 */
export async function gitRemoteGetUrl(repoPath: string, remoteName: string): Promise<string> {
  const remotes = await git.listRemotes({ fs, dir: repoPath });
  const match = remotes.find((r) => r.remote === remoteName);
  if (!match) throw new Error(`No such remote '${remoteName}'`);
  return match.url;
}

/**
 * Adds a new remote.
 */
export async function gitRemoteAdd(repoPath: string, remoteName: string, remoteUrl: string): Promise<void> {
  await git.addRemote({ fs, dir: repoPath, remote: remoteName, url: remoteUrl });
}

/**
 * Removes a remote.
 */
export async function gitRemoteRemove(repoPath: string, remoteName: string): Promise<void> {
  await git.deleteRemote({ fs, dir: repoPath, remote: remoteName });
}
