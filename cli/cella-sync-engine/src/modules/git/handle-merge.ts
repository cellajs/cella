import { RepoConfig } from '../../config';
import { gitMerge, gitCommit, isMergeInProgress, gitRemoveFilePathFromCache } from '../../utils/git/command';
import { FileAnalysis, MergeResult } from '../../types';
import { getUnmergedFiles, resolveConflictAsOurs, resolveConflictAsTheirs } from '../../utils/git/files';

/**
 * High-level function: handles merge attempt, conflict resolution, and finalization.
 */
export async function handleMerge(
  boilerplateConfig: RepoConfig,
  forkConfig: RepoConfig,
  analyzedFiles: FileAnalysis[],
): Promise<MergeResult> {
  try {
    // 1. Start merge
    await gitMerge(forkConfig.repoPath, `${boilerplateConfig.addAsRemoteName}/${boilerplateConfig.branch}`, { noEdit: true, noCommit: true });


    // 3. Finalize merge
    // await gitCommit(forkConfig.repoPath, `Merge ${boilerplateConfig.branch} into ${forkConfig.branch}`, { noVerify: true });

    return { status: 'success', isMerging: false };
  } catch (err) {
    if (isMergeInProgress(forkConfig.repoPath)) {
      await resolveMergeConflicts(forkConfig, analyzedFiles);
    }

    return { status: 'error', isMerging: false };
  }
}

async function resolveMergeConflicts(forkConfig: RepoConfig, analyzedFiles: FileAnalysis[]) {
  let conflicts = await getUnmergedFiles(forkConfig.repoPath);

  console.log('conflicts: ', conflicts)

  if (conflicts.length === 0) {
    return;
  }

  // Map analyses by file path for quick access
  const analysisMap = new Map(
    analyzedFiles.map((a) => [a.filePath, a])
  );

  for (const filePath of conflicts) {
    const file = analysisMap.get(filePath);

    console.log('=====================')
    console.log(file?.filePath)
    console.log(file?.commitSummary)
    console.log(file?.swizzle)
    console.log(file?.mergeStrategy)

    if (file?.mergeStrategy?.strategy === 'keep-fork') {
      await resolveConflictAsOurs(forkConfig.repoPath, filePath);
      continue;
    }

    if (file?.mergeStrategy?.strategy === 'remove-from-fork') {
      await gitRemoveFilePathFromCache(forkConfig.repoPath, filePath);
      continue;
    }
  }
}