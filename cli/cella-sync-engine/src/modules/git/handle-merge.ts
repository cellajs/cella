import { RepoConfig } from '../../config';
import { gitCleanUntrackedFile, gitMerge, gitRemoveFilePathFromCache, gitCleanAllUntrackedFiles, gitRestoreStagedFile, isMergeInProgress, gitCommit, gitPush } from '../../utils/git/command';
import { FileAnalysis, MergeResult } from '../../types';
import { getCachedFiles, getUnmergedFiles, resolveConflictAsOurs } from '../../utils/git/files';
import { confirm } from '@inquirer/prompts';

/**
 * High-level function: handles merge attempt, conflict resolution, and finalization.
 */
export async function handleMerge(
  boilerplateConfig: RepoConfig,
  forkConfig: RepoConfig,
  analyzedFiles: FileAnalysis[],
): Promise<MergeResult> {
  try {
    // Start merge
    await startMerge(forkConfig, boilerplateConfig);

    // For non-conflicted files, apply the chosen strategy (e.g., keep fork, remove from fork)
    await cleanupNonConflictedFiles(forkConfig.repoPath, analyzedFiles);

    // Resolve any remaining conflicts
    await resolveMergeConflicts(forkConfig, analyzedFiles);

    // Cleanup all untracked files
    await gitCleanAllUntrackedFiles(forkConfig.repoPath);

    // Finalize merge
    await gitCommit(forkConfig.repoPath, `Merge ${boilerplateConfig.branch} into ${forkConfig.branch}`, { noVerify: true });

    // Push merge result
    // await gitPush(forkConfig.repoPath, 'origin', forkConfig.branch, { setUpstream: true });

    return { status: 'success', isMerging: false };
  } catch (err) {
    console.error(err)

    return { status: 'error', isMerging: false };
  }
}

/**
 * Starts the merge process between the fork and boilerplate repositories.
 * @param forkConfig - RepoConfig of the forked repo
 * @param boilerplateConfig - RepoConfig of the boilerplate repo
 */
async function startMerge(forkConfig: RepoConfig, boilerplateConfig: RepoConfig) {
  try {
    await gitMerge(forkConfig.repoPath, `${boilerplateConfig.addAsRemoteName}/${boilerplateConfig.branch}`, { noEdit: true, noCommit: true });
  } catch (err) {
    // Check if merge is in conflict state (rethrow if not)
    if (!isMergeInProgress(forkConfig.repoPath)) {
      throw err;
    }
  }
}

/** 
 * Cleans up non-conflicted files based on their merge strategies.
 * 
 * @param forkConfig - Path to the forked repo
 * @param analyzedFiles - List of analyzed files
 */
async function cleanupNonConflictedFiles(forkConfig: string, analyzedFiles: FileAnalysis[]) {
  const cached = await getCachedFiles(forkConfig);

  if (cached.length === 0) {
    return;
  }

  const analysisMap = new Map(
    analyzedFiles.map((a) => [a.filePath, a])
  );

  for (const filePath of cached) {
    const file = analysisMap.get(filePath);

    if (file?.mergeStrategy?.strategy === 'keep-fork') {
      await gitRestoreStagedFile(forkConfig, filePath);
    }

    if (file?.mergeStrategy?.strategy === 'remove-from-fork') {
      await gitRemoveFilePathFromCache(forkConfig, filePath);
      await gitCleanUntrackedFile(forkConfig, filePath);
    }
  }
}

/**
 * Resolves merge conflicts based on the provided analyzed files and their strategies.
 * If conflicts remain after automatic resolution, prompts the user to resolve them manually.
 * @param forkConfig - RepoConfig of the forked repo
 * @param analyzedFiles - List of analyzed files
 */
async function resolveMergeConflicts(forkConfig: RepoConfig, analyzedFiles: FileAnalysis[]) {
  let conflicts = await getUnmergedFiles(forkConfig.repoPath);

  if (conflicts.length === 0) return;

  // Map analyses by file path for quick access
  const analysisMap = new Map(
    analyzedFiles.map((a) => [a.filePath, a])
  );

  for (const filePath of conflicts) {
    const file = analysisMap.get(filePath);

    if (file?.mergeStrategy?.strategy === 'keep-fork') {
      await resolveConflictAsOurs(forkConfig.repoPath, filePath);
      continue;
    }

    if (file?.mergeStrategy?.strategy === 'remove-from-fork') {
      await gitRemoveFilePathFromCache(forkConfig.repoPath, filePath);
      await gitCleanUntrackedFile(forkConfig.repoPath, filePath);
      continue;
    }
  }

  // Recheck for any remaining conflicts
  conflicts = await getUnmergedFiles(forkConfig.repoPath);

  // When there are still conflicts, notify user to resolve them
  if (conflicts.length > 0) {
    const continueResolving = await confirm({
      message: `Please resolve ${conflicts.length} merge conflicts manually (In another terminal). Once resolved, press "y" to continue.`,
      default: true,
    });

    if (!continueResolving) {
      throw new Error('Merge process aborted by user.');
    }

    return resolveMergeConflicts(forkConfig, analyzedFiles);
  }
}