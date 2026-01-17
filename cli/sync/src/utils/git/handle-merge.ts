import { confirm } from '@inquirer/prompts';

import { pauseSpinner, resumeSpinner } from '../progress';
import { gitCheckout, gitCommit, gitMerge, isMergeInProgress } from './command';
import { getUnmergedFiles } from './files';
import { hasAnythingToCommit } from './helpers';

/**
 * High-level function: handles merge attempt, conflict resolution, and finalization.
 *
 * @param mergeIntoPath - The file path of the repository where the merge is taking place.
 * @param mergeIntoBranch - The target branch to merge into.
 * @param mergeFromBranch - The source branch to merge from.
 * @param resolveConflicts - Optional function to automatically resolve conflicts.
 *
 * @throws Will throw an error if any git operation fails.
 * @returns A Promise that resolves when the merge process is complete.
 */
export async function handleMerge(
  mergeIntoPath: string,
  mergeIntoBranch: string,
  mergeFromBranch: string,
  resolveConflicts?: (() => Promise<void>) | null,
  { allowUnrelatedHistories = false } = {},
): Promise<void> {
  // Checkout to the branch to merge into
  await gitCheckout(mergeIntoPath, mergeIntoBranch);

  // Start merge
  await startMerge(mergeIntoPath, mergeFromBranch, { allowUnrelatedHistories });

  // Resolve any remaining conflicts
  if (resolveConflicts) {
    await resolveConflicts();
  }

  // Wait for any manual conflict resolution
  await waitForManualConflictResolution(mergeIntoPath);

  // Finalize merge
  if (await hasAnythingToCommit(mergeIntoPath)) {
    await gitCommit(mergeIntoPath, `Merge ${mergeFromBranch} into ${mergeIntoBranch}`, { noVerify: true });
  }
}

/**
 * Starts the merge process between the fork and upstream repositories.
 *
 * @param forkConfig - RepoConfig of the forked repo
 * @param upstreamConfig - RepoConfig of the upstream repo
 *
 * @throws Will throw an error if the merge fails for reasons other than conflicts.
 * @returns A Promise that resolves when the merge process is initiated.
 */
async function startMerge(mergeIntoPath: string, mergeFromBranch: string, { allowUnrelatedHistories = false } = {}) {
  try {
    await gitMerge(mergeIntoPath, mergeFromBranch, { noEdit: true, allowUnrelatedHistories });
  } catch (err) {
    // Check if merge is in conflict state (rethrow if not)
    if (!isMergeInProgress(mergeIntoPath)) {
      throw err;
    }
  }
}

/**
 * Resolves merge conflicts based on the provided analyzed files and their strategies.
 * If conflicts remain after automatic resolution, prompts the user to resolve them manually.
 *
 * @param mergeIntoPath - The file path of the repository where the merge is taking place.
 *
 * @throws Will throw an error if the user chooses to abort the merge process.
 * @returns A Promise that resolves when all conflicts are resolved.
 */
async function waitForManualConflictResolution(mergeIntoPath: string) {
  let conflicts = await getUnmergedFiles(mergeIntoPath);

  if (conflicts.length === 0) return;

  // Pause spinner to show prompt
  pauseSpinner();

  // When there are still conflicts, notify user to resolve them
  if (conflicts.length > 0) {
    const continueResolving = await confirm({
      message: `please resolve ${conflicts.length} merge conflicts manually (in another terminal). once resolved, press "y" to continue`,
      default: true,
    });

    if (!continueResolving) {
      throw new Error('merge process aborted by user');
    }

    // Resume spinner and check again
    resumeSpinner();
    return waitForManualConflictResolution(mergeIntoPath);
  }
}
