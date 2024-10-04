import yoctoSpinner from 'yocto-spinner';

import { runGitCommand } from './utils/run-git-command.js'
import { CELLA_REMOTE_URL } from './constants.js'

export async function fetchUpstream({
  localBranch,
}) {
  const targetFolder = process.cwd()

  // Spinner for adding upstream remote
  const upstreamSpinner = yoctoSpinner({
    text: 'Adding upstream remote',
  }).start()


  try {
    // Check if the upstream remote exists
    let upstream;

    try {
      upstream = await runGitCommand({ targetFolder, command: 'remote get-url upstream' });
    } catch(error) {
        // If the upstream remote doesn't exist, it throws a fatal error
        if (error.includes('fatal: No such remote')) {
            upstream = null;
        } else {
            throw error;
        }
    }

    // Add or update the upstream remote if it doesn't exist or differs from CELLA_REMOTE_URL
    if (!upstream) {
      await runGitCommand({ targetFolder, command: `remote add upstream ${CELLA_REMOTE_URL}` });
      upstreamSpinner.success('Upstream remote added successfully.');
    } else if (upstream !== CELLA_REMOTE_URL) {
      // Remove existing upstream and set the new URL
      await runGitCommand({ targetFolder, command: 'remote remove upstream' });
      await runGitCommand({ targetFolder, command: `remote add upstream ${CELLA_REMOTE_URL}` });
      upstreamSpinner.success('Upstream remote updated successfully.');
    } else {
      upstreamSpinner.success('Upstream remote is already configured correctly.');
    }
  } catch (error) {
    console.error(error);
    upstreamSpinner.error('Failed to add upstream remote.');
    process.exit(1);
  }

  // Spinner for fetching upstream changes
  const fetchSpinner = yoctoSpinner({
    text: 'Fetching upstream changes and checking out local branch',
  }).start()

  try {
    // Fetch upstream changes
    await runGitCommand({ targetFolder, command: 'fetch upstream' })
    
    // Checkout the specified local branch
    await runGitCommand({ targetFolder, command: `checkout ${localBranch}` })

    fetchSpinner.success('Successfully fetched upstream changes and checked out local branch.');
  } catch (error) {
    console.error(error);
    fetchSpinner.error('Failed to fetch upstream changes and checkout the local branch.');
    process.exit(1);
  }
}