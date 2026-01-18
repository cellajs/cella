import { RepoConfig } from '#/config';
import { addRemote, getRemoteUrl, hasRemote, setRemoteUrl } from '#/utils/git/git-refs';

/**
 * Adds the upstream repository as a remote to the fork repository if not already added.
 * If the remote exists but URL doesn't match, updates the URL to match configuration.
 *
 * @param addAsRemote - The repository configuration to add as a remote (e.g., upstream).
 * @param addTo - The repository configuration to which the remote should be added (e.g., fork).
 */
export async function addAsRemote(addAsRemote: RepoConfig, addTo: RepoConfig) {
  // If remote doesn't exist, add it
  if (!(await hasRemote(addTo.workingDirectory, addAsRemote.remoteName))) {
    await addRemote(addTo.workingDirectory, addAsRemote.remoteName, addAsRemote.repoReference);
    return;
  }

  // If remote exists but URL doesn't match, update it
  const currentUrl = await getRemoteUrl(addTo.workingDirectory, addAsRemote.remoteName);
  if (currentUrl !== addAsRemote.repoReference) {
    await setRemoteUrl(addTo.workingDirectory, addAsRemote.remoteName, addAsRemote.repoReference!);
  }
}
