import { RepoConfig } from '../../types/config';
import { gitCheckout, gitCommit, gitRebase, isRebaseInProgress } from '../../utils/git/command';
import { getUnmergedFiles } from '../../utils/git/files';
import { confirm } from '@inquirer/prompts';
import { MergeResult } from '../../types';

/**
 * Rebases the target branch (e.g., squash commit) back into the fork's sync branch.
 * Automatically checks out the sync branch and starts the rebase.
 * Any conflicts that arise will prompt the user to resolve them manually.
 *
 * @param forkConfig - Configuration of the fork repository.
 * @returns A MergeResult indicating success or error.
 *
 * @example
 * await handleRebase(forkConfig);
 */
export async function handleRebase(forkConfig: RepoConfig): Promise<MergeResult> {
  try {
    // Checkout the sync branch
    await gitCheckout(forkConfig.repoPath, forkConfig.branch);

    // Start the rebase process
    await startRebase(forkConfig);

    // Handle conflicts manually
    await waitForManualConflictResolution(forkConfig);

    return { status: 'success', isMerging: false };
  } catch (err: any) {
    console.error('Error during rebase:', err.message || err);
    return { status: 'error', isMerging: false };
  }
}

/**
 * Starts the merge process between the fork and boilerplate repositories.
 * @param forkConfig - RepoConfig of the forked repo
 * @param boilerplateConfig - RepoConfig of the boilerplate repo
 */
async function startRebase(forkConfig: RepoConfig) {
  try {
    if (!forkConfig.targetBranch) {
      throw new Error('forkConfig.targetBranch is not defined');
    }

    // Start rebase from target branch into sync branch
    await gitRebase(forkConfig.repoPath, forkConfig.targetBranch);
  } catch (err) {
    // Check if merge is in conflict state (rethrow if not)
    if (!isRebaseInProgress(forkConfig.repoPath)) {
      throw err;
    }
  }
}

/**
 * Checks for unmerged files and prompts the user to resolve them manually.
 * Recursively waits until all conflicts are resolved.
 *
 * @param forkConfig - Configuration of the fork repository.
 */
async function waitForManualConflictResolution(forkConfig: RepoConfig): Promise<void> {
  let conflicts = await getUnmergedFiles(forkConfig.repoPath);

  if (conflicts.length === 0) {
    if (isRebaseInProgress(forkConfig.repoPath)) {
      if (!forkConfig.targetBranch) {
        throw new Error('forkConfig.targetBranch is not defined');
      }

      // Continue the rebase process
      await gitRebase(forkConfig.repoPath, forkConfig.targetBranch, { continue: true, skipEditor: true });
      await waitForManualConflictResolution(forkConfig);
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
  await waitForManualConflictResolution(forkConfig);
}