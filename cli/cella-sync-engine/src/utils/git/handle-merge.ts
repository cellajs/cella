import { confirm } from '@inquirer/prompts';

import { config } from '../../config';

import { gitMerge, isMergeInProgress, gitCommit, gitCheckout, gitPush } from './command';
import { MergeResult } from '../../types';
import { getUnmergedFiles } from './files';
import { hasAnythingToCommit } from './helpers';
import { hasRemoteBranch } from './branches';

/**
 * High-level function: handles merge attempt, conflict resolution, and finalization.
 * 
 * @param mergeIntoPath - The file path of the repository where the merge is taking place.
 * @param mergeIntoBranch - The target branch to merge into.
 * @param mergeFromBranch - The source branch to merge from.
 * @param resolveConflicts - Optional function to automatically resolve conflicts.
 * 
 * @throws Will throw an error if any git operation fails.
 * @returns A Promise that resolves to a MergeResult indicating the outcome of the merge operation.
 */
export async function handleMerge(
  mergeIntoPath: string,
  mergeIntoBranch: string,
  mergeFromBranch: string,
  resolveConflicts?: (() => Promise<void>) | null,
): Promise<MergeResult> {
  try {
    // Checkout to the branch to merge into
    await gitCheckout(mergeIntoPath, mergeIntoBranch);

    // Start merge
    await startMerge(mergeIntoPath, mergeFromBranch);

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

    // Push merge result
    if (!config.behavior.skipAllPushes && await hasRemoteBranch(mergeIntoPath, mergeIntoBranch)) {
      await gitPush(mergeIntoPath, 'origin', mergeIntoBranch, { setUpstream: true });
    }

    return { status: 'success', isMerging: false };
  } catch (err) {
    console.error(err)

    return { status: 'error', isMerging: false };
  }
}

/**
 * Starts the merge process between the fork and boilerplate repositories.
 * 
 * @param forkConfig - RepoConfig of the forked repo
 * @param boilerplateConfig - RepoConfig of the boilerplate repo
 * 
 * @throws Will throw an error if the merge fails for reasons other than conflicts.
 * @returns A Promise that resolves when the merge process is initiated.
 */
async function startMerge(mergeIntoPath: string, mergeFromBranch: string) {
  try {
    await gitMerge(mergeIntoPath, mergeFromBranch, { noEdit: true });
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

  // When there are still conflicts, notify user to resolve them
  if (conflicts.length > 0) {
    const continueResolving = await confirm({
      message: `Please resolve ${conflicts.length} merge conflicts manually (In another terminal). Once resolved, press "y" to continue.`,
      default: true,
    });

    if (!continueResolving) {
      throw new Error('Merge process aborted by user.');
    }

    return waitForManualConflictResolution(mergeIntoPath);
  }
}