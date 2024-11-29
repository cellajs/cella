import yoctoSpinner from 'yocto-spinner';
import { runGitCommand } from './utils/run-git-command.ts';
import { CELLA_REMOTE_URL } from './constants.ts';

interface FetchRemoteOptions {
  localBranch: string;
  remoteUrl?: string; // Optional, defaults to CELLA_REMOTE_URL
  remoteName?: string; // Optional, defaults to 'upstream'
}

export async function fetchRemote({
  localBranch,
  remoteUrl = CELLA_REMOTE_URL,
  remoteName = 'upstream',
}: FetchRemoteOptions): Promise<void> {
  const targetFolder = process.cwd();

  // Spinner for adding remote
  const remoteSpinner = yoctoSpinner({
    text: 'Adding remote',
  }).start();

  try {
    // Check if the remote exists
    let remote: string | null = null;

    try {
      remote = await runGitCommand({ targetFolder, command: `remote get-url ${remoteName}` });
    } catch (error: any) {
      // If the remote doesn't exist, it throws a fatal error
      const errorMessage = typeof error === 'string' ? error : error?.message || '';
      if (errorMessage.includes('No such remote')) {
        remote = null;
      } else {
        throw error;
      }
    }

    // Add or update the remote if it doesn't exist or differs from `remoteUrl`
    if (!remote) {
      await runGitCommand({ targetFolder, command: `remote add ${remoteName} ${remoteUrl}` });
      remoteSpinner.success('Remote added successfully.');
    } else if (remote !== remoteUrl) {
      // Remove existing remote and set the new URL
      await runGitCommand({ targetFolder, command: `remote remove ${remoteName}` });
      await runGitCommand({ targetFolder, command: `remote add ${remoteName} ${remoteUrl}` });
      remoteSpinner.success('Remote updated successfully.');
    } else {
      remoteSpinner.success('Remote is already configured correctly.');
    }
  } catch (error) {
    console.error(error);
    remoteSpinner.error('Failed to add remote.');
    process.exit(1);
  }

  // Spinner for fetching remote changes
  const fetchSpinner = yoctoSpinner({
    text: 'Fetching remote changes and checking out local branch',
  }).start();

  try {
    // Fetch remote changes
    await runGitCommand({ targetFolder, command: `fetch ${remoteName}` });

    // Checkout the specified local branch
    await runGitCommand({ targetFolder, command: `checkout ${localBranch}` });

    fetchSpinner.success('Successfully fetched remote changes and checked out local branch.');
  } catch (error) {
    console.error(error);
    fetchSpinner.error('Failed to fetch remote changes and checkout the local branch.');
    process.exit(1);
  }
}
