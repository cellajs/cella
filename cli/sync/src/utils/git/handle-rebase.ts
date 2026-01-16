import { gitCheckout, gitRebase, isRebaseInProgress } from '../../utils/git/command';
import { getUnmergedFiles } from '../../utils/git/files';
import { confirm } from '@inquirer/prompts';

/**
 * Rebases the target branch (e.g., squash commit) back into the fork's sync branch.
 * Automatically checks out the sync branch and starts the rebase.
 * Any conflicts that arise will prompt the user to resolve them manually.
 *
 * @param forkConfig - Configuration of the fork repository.
 * 
 * @returns A promise that resolves when the rebase process is complete.
 *
 * @example
 * await handleRebase(forkConfig);
 */
export async function handleRebase(
  rebaseIntoPath: string,
  rebaseIntoBranch: string,
  rebaseFromBranch: string,
): Promise<void> {
  // Checkout the sync branch
  await gitCheckout(rebaseIntoPath, rebaseIntoBranch);

  // Start the rebase process
  await startRebase(rebaseIntoPath, rebaseFromBranch);

  // Handle conflicts manually
  await waitForManualConflictResolution(rebaseIntoPath, rebaseFromBranch);
}

/**
 * Starts the merge process between the fork and upstream repositories.
 * @param forkConfig - RepoConfig of the forked repo
 * @param upstreamConfig - RepoConfig of the upstream repo
 * 
 * @throws Will throw an error if the rebase fails for reasons other than conflicts.
 * @returns A promise that resolves when the rebase is initiated.
 */
async function startRebase(rebaseIntoPath: string, rebaseFromBranch: string) {
  try {
    // Start rebase from target branch into sync branch
    await gitRebase(rebaseIntoPath, rebaseFromBranch);
  } catch (err) {
    // Check if merge is in conflict state (rethrow if not)
    if (!isRebaseInProgress(rebaseIntoPath)) {
      throw err;
    }
  }
}

/**
 * Checks for unmerged files and prompts the user to resolve them manually.
 * Recursively waits until all conflicts are resolved.
 *
 * @param rebaseIntoPath - Configuration of the fork repository.
 * @param rebaseFromBranch - The branch being rebased from.
 * 
 * @throws Will throw an error if the user decides to abort the rebase process.
 * @returns A promise that resolves when all conflicts are resolved.
 */
async function waitForManualConflictResolution(rebaseIntoPath: string, rebaseFromBranch: string): Promise<void> {
  let conflicts = await getUnmergedFiles(rebaseIntoPath);

  if (conflicts.length === 0) {
    if (isRebaseInProgress(rebaseIntoPath)) {
      // Continue the rebase process
      await gitRebase(rebaseIntoPath, rebaseFromBranch, { continue: true, skipEditor: true });
      await waitForManualConflictResolution(rebaseIntoPath, rebaseFromBranch);
    }

    return;
  }

  const proceed = await confirm({
    message: `Please resolve ${conflicts.length} Rebase conflicts manually (In another terminal). Once resolved, press "y" to continue.`,
    default: true,
  });

  if (!proceed) {
    throw new Error('Rebase process aborted by user.');
  }

  // Recursively check until no conflicts remain
  await waitForManualConflictResolution(rebaseIntoPath, rebaseFromBranch);
}