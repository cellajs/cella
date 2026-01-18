/**
 * Sync module - Handles the full synchronization process between upstream and fork.
 */
import { config } from '#/config';
import { handleUpstreamIntoForkMerge } from '#/modules/git/handle-upstream-into-fork-merge';
import type { FileAnalysis } from '#/types';
import { handleSquashMerge } from '#/utils/git/git-merge';
import { createProgress } from '#/utils/progress';

/**
 * Runs the full synchronization process between the upstream and fork repositories.
 *
 * This function orchestrates:
 * 1. Merge upstream into sync branch - applies updates with conflict resolution
 * 2. Squash sync branch into target branch - staged, not committed
 *
 * @param analyzedFiles - Array of FileAnalysis objects from runAnalyze()
 * @returns A promise resolving to the suggested commit message, or null if no changes.
 */
export async function runSync(analyzedFiles: FileAnalysis[]): Promise<string | null> {
  const progress = createProgress('syncing');

  return await progress.wrap(async () => {
    progress.step('merging upstream → sync branch');

    await handleUpstreamIntoForkMerge(config.upstream, config.fork, analyzedFiles);

    progress.step('squashing → target branch');

    const commitMessage = await handleSquashMerge(config.forkLocalPath, config.forkBranchRef, config.forkSyncBranchRef);

    if (commitMessage) {
      progress.done(`changes staged on '${config.forkBranchRef}'`);
    } else {
      progress.done('no changes to sync');
    }

    return commitMessage;
  });
}
