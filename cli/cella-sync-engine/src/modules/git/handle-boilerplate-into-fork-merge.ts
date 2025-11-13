import { confirm } from '@inquirer/prompts';

import { RepoConfig } from '../../config';
import { gitCleanUntrackedFile, gitRemoveFilePathFromCache, gitCleanAllUntrackedFiles, gitRestoreStagedFile } from '../../utils/git/command';
import { FileAnalysis, MergeResult } from '../../types';
import { getCachedFiles, getUnmergedFiles, resolveConflictAsOurs } from '../../utils/git/files';
import { handleMerge } from '../../utils/git/handle-merge';

/**
 * High-level function: handles merge attempt, conflict resolution, and finalization.
 */
export async function handleBoilerplateIntoForkMerge(
  boilerplateConfig: RepoConfig,
  forkConfig: RepoConfig,
  analyzedFiles: FileAnalysis[],
): Promise<MergeResult> {
  try {
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
      }
    );

    return { status: 'success', isMerging: false };
  } catch (err) {
    console.error(err)

    return { status: 'error', isMerging: false };
  }
}

/** 
 * Cleans up non-conflicted files based on their merge strategies.
 * 
 * @param forkConfig - Path to the forked repo
 * @param analyzedFiles - List of analyzed files
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
 * @param forkConfig - RepoConfig of the forked repo
 * @param analyzedFiles - List of analyzed files
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