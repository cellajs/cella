import { config, RepoConfig } from '../../config';
import { addRemote, getRemoteUrl, hasRemote, setRemoteUrl } from '../../utils/git/remotes';

/**
 * Adds the upstream repository as a remote to the fork repository if not already added.
 * - If the remote already exists, checks if the URL matches the configuration.
 * - If the URL does not match and config.behavior.onRemoteWrongUrl is 'overwrite', updates the URL.
 * - If the URL does not match and config.behavior.onRemoteWrongUrl is not 'overwrite', throws an error.
 *
 * @param addAsRemote - The repository configuration to add as a remote (e.g., upstream).
 * @param addTo - The repository configuration to which the remote should be added (e.g., fork).
 *
 * @throws Error if the remote URL does not match and the behavior is not set to 'overwrite'.
 * @returns void
 */
export async function addAsRemote(addAsRemote: RepoConfig, addTo: RepoConfig) {
  // If upstream is not added as remote to fork, add it
  if (!(await hasRemote(addTo.workingDirectory, addAsRemote.remoteName))) {
    await addRemote(addTo.workingDirectory, addAsRemote.remoteName, addAsRemote.repoReference);
    return;
  }

  // Check remote URL matches configuration
  const currentUrl = await getRemoteUrl(addTo.workingDirectory, addAsRemote.remoteName);
  if (currentUrl === addAsRemote.repoReference) {
    return;
  }

  // Update remote URL to match configuration
  if (config.behavior.onRemoteWrongUrl === 'overwrite') {
    await setRemoteUrl(addTo.workingDirectory, addAsRemote.remoteName, addAsRemote.repoReference!);
    return;
  }

  throw new Error(`Remote URL for '${addAsRemote.remoteName}' in target repository does not match configuration.`);
}
