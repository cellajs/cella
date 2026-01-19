import { confirm } from '@inquirer/prompts';

import { RepoConfig } from '#/config';
import { getOverrideStatus } from '#/modules/overrides';
import { FileAnalysis } from '#/types';
import {
  gitCleanAllUntrackedFiles,
  gitCleanUntrackedFile,
  gitRemoveFilePathFromCache,
  gitRestoreStagedFile,
} from '#/utils/git/command';
import { getCachedFiles, getStagedDeletions, getUnmergedFiles, resolveConflictAsOurs } from '#/utils/git/files';
import { handleMerge } from '#/utils/git/git-merge';
import { pauseSpinner, resumeSpinner } from '#/utils/progress';

/**
 * High-level function: handles merge attempt, conflict resolution, and finalization.
 *
 * @param upstreamConfig - Configuration for the upstream repository
 * @param forkConfig - Configuration for the forked repository
 * @param analyzedFiles - List of pre-analyzed files with merge strategies
 *
 * @returns A Promise that resolves when the merge process is complete.
 */
export async function handleUpstreamIntoForkMerge(
  upstreamConfig: RepoConfig,
  forkConfig: RepoConfig,
  analyzedFiles: FileAnalysis[],
): Promise<void> {
  // Check if this is the first sync and confirm with the user
  const isFirstSync = await checkIfFirstSyncAndConfirm(analyzedFiles);

  // Start merge
  await handleMerge(
    forkConfig.workingDirectory,
    forkConfig.syncBranchRef,
    upstreamConfig.branchRef,
    async function resolveConflicts() {
      // Protect ignored/pinned files from deletion
      await restoreProtectedDeletions(forkConfig.workingDirectory);

      // For non-conflicted files, apply the chosen strategy (e.g., keep fork, remove from fork)
      await cleanupNonConflictedFiles(forkConfig.workingDirectory, analyzedFiles);

      // Resolve any remaining conflicts
      await resolveMergeConflicts(forkConfig.workingDirectory, analyzedFiles);

      // Cleanup all untracked files
      await gitCleanAllUntrackedFiles(forkConfig.workingDirectory);
    },
    { allowUnrelatedHistories: isFirstSync },
  );
}

/**
 * Checks if this is the first sync by analyzing commit summaries.
 * If so, prompts the user for confirmation to continue.
 * We need to allow unrelated histories in this case.
 *
 * @param analyzedFiles - List of analyzed files
 * @throws Error if the user chooses to abort the merge process.
 *
 * @returns boolean indicating if this is the first sync
 */
async function checkIfFirstSyncAndConfirm(analyzedFiles: FileAnalysis[]): Promise<boolean> {
  // Check if there are only unrelated history files (if so, ask user if this is the first sync, then we need to run it with: --allow-unrelated-histories)
  const isFirstSync = analyzedFiles.every((file) => file.commitSummary?.status === 'unrelated');

  // If it's possibly the first sync, confirm with the user
  if (isFirstSync) {
    pauseSpinner();

    const continueSync = await confirm({
      message: `it looks like this might be the first sync (all ${analyzedFiles.length} files have unrelated histories). this requires allowing unrelated histories in the merge. do you want to continue?`,
      default: true,
    });

    if (!continueSync) {
      throw new Error('merge process aborted by user');
    }

    resumeSpinner();

    return isFirstSync;
  }

  return false;
}

/**
 * Restores files that are staged for deletion but match ignored or pinned patterns.
 * This protects fork-specific files from being deleted when upstream removes them.
 *
 * @param repoPath - Path to the repository
 *
 * @returns void
 */
async function restoreProtectedDeletions(repoPath: string): Promise<void> {
  const deletions = await getStagedDeletions(repoPath);

  if (deletions.length === 0) {
    return;
  }

  for (const filePath of deletions) {
    const overrideStatus = getOverrideStatus(filePath);

    // Restore files that are ignored or pinned
    if (overrideStatus === 'ignored' || overrideStatus === 'pinned') {
      await gitRestoreStagedFile(repoPath, filePath);
    }
  }
}

/**
 * Cleans up non-conflicted files based on their merge strategies.
 *
 * @param repoPath - Path to the forked repo
 * @param analyzedFiles - List of analyzed files
 *
 * @returns void
 */
async function cleanupNonConflictedFiles(repoPath: string, analyzedFiles: FileAnalysis[]) {
  const cached = await getCachedFiles(repoPath);

  if (cached.length === 0) {
    return;
  }

  const analysisMap = new Map(analyzedFiles.map((a) => [a.filePath, a]));

  for (const filePath of cached) {
    const file = analysisMap.get(filePath);

    if (file?.mergeStrategy?.strategy === 'keep-fork') {
      await gitRestoreStagedFile(repoPath, filePath);
    }

    if (file?.mergeStrategy?.strategy === 'skip-upstream') {
      await gitRemoveFilePathFromCache(repoPath, filePath);
      await gitCleanUntrackedFile(repoPath, filePath);
    }
  }
}

/**
 * Resolves merge conflicts based on the provided analyzed files and their strategies.
 * If conflicts remain after automatic resolution, prompts the user to resolve them manually.
 *
 * @param forkConfig - RepoConfig of the forked repo
 * @param analyzedFiles - List of analyzed files
 *
 * @throws Error if the user chooses to abort the merge process.
 * @returns void
 */
async function resolveMergeConflicts(repoPath: string, analyzedFiles: FileAnalysis[]) {
  let conflicts = await getUnmergedFiles(repoPath);

  if (conflicts.length === 0) return;

  // Map analyses by file path for quick access
  const analysisMap = new Map(analyzedFiles.map((a) => [a.filePath, a]));

  for (const filePath of conflicts) {
    const file = analysisMap.get(filePath);

    if (file?.mergeStrategy?.strategy === 'keep-fork') {
      await resolveConflictAsOurs(repoPath, filePath);
      continue;
    }

    if (file?.mergeStrategy?.strategy === 'skip-upstream') {
      await gitRemoveFilePathFromCache(repoPath, filePath);
      await gitCleanUntrackedFile(repoPath, filePath);
      continue;
    }
  }

  // Recheck for any remaining conflicts
  conflicts = await getUnmergedFiles(repoPath);

  // When there are still conflicts, notify user to resolve them
  if (conflicts.length > 0) {
    pauseSpinner();

    const continueResolving = await confirm({
      message: `please resolve ${conflicts.length} merge conflicts manually (in another terminal). once resolved, press "y" to continue`,
      default: true,
    });

    if (!continueResolving) {
      throw new Error('merge process aborted by user');
    }

    resumeSpinner();

    return resolveMergeConflicts(repoPath, analyzedFiles);
  }
}
