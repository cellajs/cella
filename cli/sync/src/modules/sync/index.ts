/**
 * Sync module - Merges upstream changes into sync-branch with conflict resolution.
 *
 * This is phase 3 of the sync pipeline. After this:
 * - sync-branch has upstream changes merged (with conflicts resolved)
 * - Changes are NOT yet squashed to development
 * - Packages, validation, and squash happen in subsequent phases
 */
import { config } from '#/config';
import { handleUpstreamIntoForkMerge } from '#/modules/git/handle-upstream-into-fork-merge';
import type { FileAnalysis } from '#/types';
import { createProgress } from '#/utils/progress';

/**
 * Merges upstream changes into the sync branch with conflict resolution.
 *
 * This function:
 * 1. Merges upstream → sync-branch
 * 2. Resolves conflicts using analyzed strategies (pinned/ignored)
 * 3. Prompts for manual resolution if needed
 *
 * Does NOT squash to development - that happens after packages and validation.
 *
 * @param analyzedFiles - Array of FileAnalysis objects from runAnalyze()
 */
export async function runSync(analyzedFiles: FileAnalysis[]): Promise<void> {
  const progress = createProgress('syncing');

  await progress.wrap(async () => {
    progress.step('merging upstream → sync branch');

    await handleUpstreamIntoForkMerge(config.upstream, config.fork, analyzedFiles);

    progress.done('upstream merged into sync branch');
  });
}
