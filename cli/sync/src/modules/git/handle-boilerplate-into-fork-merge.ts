import { confirm } from '@inquirer/prompts';

import { RepoConfig } from '../../config';
import { gitCleanUntrackedFile, gitRemoveFilePathFromCache, gitCleanAllUntrackedFiles, gitRestoreStagedFile } from '../../utils/git/command';
import { FileAnalysis } from '../../types';
import { getCachedFiles, getUnmergedFiles, resolveConflictAsOurs } from '../../utils/git/files';
import { handleMerge } from '../../utils/git/handle-merge';

/**
 * High-level function: handles merge attempt, conflict resolution, and finalization.
 * 
 * @param boilerplateConfig - Configuration for the boilerplate repository
 * @param forkConfig - Configuration for the forked repository
 * @param analyzedFiles - List of pre-analyzed files with merge strategies
 * 
 * @returns A Promise that resolves when the merge process is complete.
 */
export async function handleBoilerplateIntoForkMerge(
  boilerplateConfig: RepoConfig,
  forkConfig: RepoConfig,
  analyzedFiles: FileAnalysis[],
): Promise<void> {
  // Check if this is the first sync and confirm with the user
  const isFirstSync = await checkIfFirstSyncAndConfirm(analyzedFiles);

  // Start merge
  await handleMerge(
    forkConfig.workingDirectory,
    forkConfig.syncBranchRef,
    boilerplateConfig.branchRef,
    async function resolveConflicts() {
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
  const isFirstSync = analyzedFiles.every(file => file.commitSummary?.status === 'unrelated');

  // If it's possibly the first sync, confirm with the user
  if (isFirstSync) {
    const continueSync = await confirm({
      message: `It looks like this might be the first sync (all ${analyzedFiles.length} files have unrelated histories).\n This requires allowing unrelated histories in the merge. Do you want to continue?`,
      default: true,
    });

    if (!continueSync) {
      throw new Error('Merge process aborted by user.');
    }

    return isFirstSync;
  }

  return false;
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

  const analysisMap = new Map(
    analyzedFiles.map((a) => [a.filePath, a])
  );

  for (const filePath of cached) {
    const file = analysisMap.get(filePath);

    if (file?.mergeStrategy?.strategy === 'keep-fork') {
      await gitRestoreStagedFile(repoPath, filePath);
    }

    if (file?.mergeStrategy?.strategy === 'remove-from-fork') {
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
  const analysisMap = new Map(
    analyzedFiles.map((a) => [a.filePath, a])
  );

  for (const filePath of conflicts) {
    const file = analysisMap.get(filePath);

    if (file?.mergeStrategy?.strategy === 'keep-fork') {
      await resolveConflictAsOurs(repoPath, filePath);
      continue;
    }

    if (file?.mergeStrategy?.strategy === 'remove-from-fork') {
      await gitRemoveFilePathFromCache(repoPath, filePath);
      await gitCleanUntrackedFile(repoPath, filePath);
      continue;
    }
  }

  // Recheck for any remaining conflicts
  conflicts = await getUnmergedFiles(repoPath);

  // When there are still conflicts, notify user to resolve them
  if (conflicts.length > 0) {
    const continueResolving = await confirm({
      message: `Please resolve ${conflicts.length} merge conflicts manually (In another terminal). Once resolved, press "y" to continue.`,
      default: true,
    });

    if (!continueResolving) {
      throw new Error('Merge process aborted by user.');
    }

    return resolveMergeConflicts(repoPath, analyzedFiles);
  }
}