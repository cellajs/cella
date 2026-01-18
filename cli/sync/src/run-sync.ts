import { config } from './config';
import { handleUpstreamIntoForkMerge } from './modules/git/handle-upstream-into-fork-merge';
import { FileAnalysis } from './types';
import { handleSquashMerge } from './utils/git/git-merge';
import { createProgress } from './utils/progress';

/**
 * Runs the full synchronization process between the upstream and fork repositories.
 *
 * This function orchestrates the following steps:
 *
 * 1. **Merge upstream into sync branch**
 *    Applies all updates from the upstream repository into the fork's sync branch.
 *    Conflicts are analyzed and resolved according to the swizzle rules.
 *
 * 2. **Squash sync branch into target branch (staged, not committed)**
 *    Collapses all sync-related commits and stages them on the fork's target branch.
 *    Changes are NOT committed - developer reviews and commits manually.
 *
 * @param analyzedFiles - Array of `FileAnalysis` objects returned from `runAnalyze()`.
 *
 * @returns A promise resolving to the suggested commit message, or null if no changes.
 */
export async function runSync(analyzedFiles: FileAnalysis[]): Promise<string | null> {
  const progress = createProgress('syncing');

  return await progress.wrap(async () => {
    progress.step('merging upstream → sync branch');

    // Merge upstream into fork (sync-branch)
    await handleUpstreamIntoForkMerge(config.upstream, config.fork, analyzedFiles);

    progress.step('squashing → target branch');

    // Squash merge sync-branch → target branch (staged, not committed)
    const commitMessage = await handleSquashMerge(config.forkLocalPath, config.forkBranchRef, config.forkSyncBranchRef);

    if (commitMessage) {
      progress.done(`changes staged on '${config.forkBranchRef}'`);
    } else {
      progress.done('no changes to sync');
    }

    return commitMessage;
  });
}
