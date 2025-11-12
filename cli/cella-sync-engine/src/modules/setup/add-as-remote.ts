import { behaviorConfig } from "../../config";

import { RepoConfig } from "../../config";
import { addRemote, getRemoteUrl, hasRemote, setRemoteUrl } from "../../utils/git/remotes";

/**
 * Adds the boilerplate repository as a remote to the fork repository if not already added.
 * - If the remote already exists, checks if the URL matches the configuration.
 * - If the URL does not match and behaviorConfig.onRemoteWrongUrl is 'overwrite', updates the URL.
 * - If the URL does not match and behaviorConfig.onRemoteWrongUrl is not 'overwrite', throws an error.
 */
export async function addAsRemote(
    addAsRemote: RepoConfig,
    addTo: RepoConfig,
) {
  const remoteUrl = addAsRemote.use === 'remote' ? addAsRemote.remoteUrl! : addAsRemote.localPath!;

  // If boilerplate is not added as remote to fork, add it
  if (!await hasRemote(addTo.workingDirectory, addAsRemote.remoteName)) {
    await addRemote(addTo.workingDirectory, addAsRemote.remoteName, remoteUrl!);
    return;
  }

  // Check remote URL matches configuration
  const currentUrl = await getRemoteUrl(addTo.workingDirectory, addAsRemote.remoteName);
  if (currentUrl === remoteUrl) {
    return;
  }

  // Update remote URL to match configuration
  if (behaviorConfig.onRemoteWrongUrl === 'overwrite') {
    await setRemoteUrl(addTo.workingDirectory, addAsRemote.remoteName, remoteUrl!);
    return;
  }

  throw new Error(`Remote URL for '${addAsRemote.remoteName}' in target repository does not match configuration.`);
}