import { confirm } from '@inquirer/prompts';

import { RepoConfig } from '#/config';
import { getOverrideStatus } from '#/modules/overrides';
import { FileAnalysis } from '#/types';
import {
  gitAdd,
  gitAddAll,
  gitCheckoutFileFromRef,
  gitCleanAllUntrackedFiles,
  gitCleanUntrackedFile,
  gitLsFiles,
  gitRemoveFilePathFromCache,
  gitRestoreFileFromRef,
  gitRestoreStagedFile,
} from '#/utils/git/command';
import {
  getCachedFiles,
  getStagedDeletions,
  getUnmergedFiles,
  resolveConflictAsOurs,
  resolveConflictAsTheirs,
} from '#/utils/git/files';
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
      // Protect ignored/pinned files from deletion (restore from fork's development branch)
      await restoreProtectedDeletions(forkConfig.workingDirectory, forkConfig.branchRef);

      // For non-conflicted files, apply the chosen strategy (e.g., keep fork, remove from fork)
      await cleanupNonConflictedFiles(forkConfig.workingDirectory, analyzedFiles);

      // Resolve any remaining conflicts
      await resolveMergeConflicts(forkConfig.workingDirectory, forkConfig.branchRef, analyzedFiles);

      // Remove ignored files that may have been synced previously (won't appear in cached diff)
      await removeIgnoredFilesFromTree(forkConfig.workingDirectory);

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
 * @param sourceRef - The branch/ref to restore files from (typically fork's development branch)
 *
 * @returns void
 */
async function restoreProtectedDeletions(repoPath: string, sourceRef: string): Promise<void> {
  const deletions = await getStagedDeletions(repoPath);

  if (deletions.length === 0) {
    return;
  }

  for (const filePath of deletions) {
    const overrideStatus = getOverrideStatus(filePath);

    // Restore files that are ignored or pinned from the fork's branch
    if (overrideStatus === 'ignored' || overrideStatus === 'pinned') {
      await gitRestoreFileFromRef(repoPath, filePath, sourceRef);
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
      // For ignored files: if file exists in fork, restore it; if new from upstream, remove it
      if (file?.forkFile) {
        // File exists in fork - restore fork's version (don't delete it!)
        await gitRestoreStagedFile(repoPath, filePath);
      } else {
        // New file from upstream - don't add it
        await gitRemoveFilePathFromCache(repoPath, filePath);
        await gitCleanUntrackedFile(repoPath, filePath);
      }
    }
  }
}

/**
 * Resolves merge conflicts based on the provided analyzed files and their strategies.
 * If conflicts remain after automatic resolution, prompts the user to resolve them manually.
 *
 * @param repoPath - Path to the repository
 * @param forkBranchRef - Reference to the fork's development branch (for restoring fork-only files)
 * @param analyzedFiles - List of analyzed files
 *
 * @throws Error if the user chooses to abort the merge process.
 * @returns void
 */
async function resolveMergeConflicts(repoPath: string, forkBranchRef: string, analyzedFiles: FileAnalysis[]) {
  let conflicts = await getUnmergedFiles(repoPath);

  if (conflicts.length === 0) return;

  // Map analyses by file path for quick access
  const analysisMap = new Map(analyzedFiles.map((a) => [a.filePath, a]));

  for (const filePath of conflicts) {
    const file = analysisMap.get(filePath);

    // FIRST: Check override status directly for ALL conflicted files
    // This ensures ignored/pinned files are always handled, even if analysis is incomplete
    const overrideStatus = getOverrideStatus(filePath);

    if (overrideStatus === 'ignored' || overrideStatus === 'pinned') {
      // Check if file exists in fork's branch
      try {
        await gitCheckoutFileFromRef(repoPath, filePath, forkBranchRef);
        await gitAdd(repoPath, filePath); // Stage to resolve the conflict
      } catch {
        // File doesn't exist in fork - this is an upstream-only file in an ignored path
        // Remove it from the merge (don't add upstream's version)
        await gitRemoveFilePathFromCache(repoPath, filePath);
        await gitCleanUntrackedFile(repoPath, filePath);
      }
      continue;
    }

    // Handle files that are in the analysis map with known strategies
    if (file?.mergeStrategy?.strategy === 'keep-fork') {
      await resolveConflictAsOurs(repoPath, filePath);
      continue;
    }

    if (file?.mergeStrategy?.strategy === 'keep-upstream') {
      await resolveConflictAsTheirs(repoPath, filePath);
      continue;
    }

    if (file?.mergeStrategy?.strategy === 'skip-upstream') {
      // For ignored files: if file exists in fork, keep fork version; if new from upstream, remove it
      if (file?.forkFile) {
        // File exists in fork - resolve conflict by keeping fork's version
        await resolveConflictAsOurs(repoPath, filePath);
      } else {
        // New file from upstream - don't add it
        await gitRemoveFilePathFromCache(repoPath, filePath);
        await gitCleanUntrackedFile(repoPath, filePath);
      }
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

    // Stage all changes after user resolves conflicts manually.
    // This handles edge cases like running `pnpm install` during resolution,
    // which modifies pnpm-lock.yaml and would otherwise cause "uncommitted changes" errors.
    await gitAddAll(repoPath);

    resumeSpinner();

    return resolveMergeConflicts(repoPath, forkBranchRef, analyzedFiles);
  }
}

/**
 * Removes ignored files from the working tree that may have been added in previous syncs.
 *
 * This handles a specific edge case: if ignored files were accidentally synced previously,
 * they won't appear in `git diff --cached` (since they're unchanged), but they still exist
 * on sync-branch. This function scans all tracked files and removes any that match ignored patterns.
 *
 * @param repoPath - Path to the repository
 */
async function removeIgnoredFilesFromTree(repoPath: string): Promise<void> {
  const trackedFiles = await gitLsFiles(repoPath);

  for (const filePath of trackedFiles) {
    const overrideStatus = getOverrideStatus(filePath);

    if (overrideStatus === 'ignored') {
      // Remove from index and clean from disk
      try {
        await gitRemoveFilePathFromCache(repoPath, filePath);
        await gitCleanUntrackedFile(repoPath, filePath);
      } catch {
        // File may not exist or already be removed, ignore errors
      }
    }
  }
}
