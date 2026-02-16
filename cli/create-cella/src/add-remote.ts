import { CELLA_REMOTE_URL } from '#/constants';
import type { AddRemoteOptions } from '#/modules/cli';
import { gitRemoteAdd, gitRemoteGetUrl, gitRemoteRemove } from '#/utils/git';

/**
 * Adds or updates the upstream remote for the Cella template.
 * @param options - Configuration options
 * @param options.silent - If true, don't throw on failure (used when called from progress tracker)
 */
export async function addRemote({
  targetFolder,
  remoteUrl = CELLA_REMOTE_URL,
  remoteName = 'upstream',
  silent = false,
}: AddRemoteOptions): Promise<void> {
  try {
    // Check if the remote exists
    let remote: string | null = null;

    try {
      remote = await gitRemoteGetUrl(targetFolder, remoteName);
    } catch {
      // If the remote doesn't exist, it throws a fatal error
      remote = null;
    }

    // Add or update the remote if it doesn't exist or differs from `remoteUrl`
    if (!remote) {
      await gitRemoteAdd(targetFolder, remoteName, remoteUrl);
    } else if (remote !== remoteUrl) {
      // Remove existing remote and set the new URL
      await gitRemoteRemove(targetFolder, remoteName);
      await gitRemoteAdd(targetFolder, remoteName, remoteUrl);
    }
  } catch (error) {
    if (!silent) {
      throw error;
    }
  }
}
