/**
 * Squash module - Squashes validated sync-branch changes into development.
 *
 * This is phase 6 (final) of the sync pipeline. Runs AFTER validation passes.
 * At this point:
 * - sync-branch has all upstream changes merged
 * - package.json dependencies are synced
 * - pnpm install && pnpm check have passed
 * - All changes are committed on sync-branch
 *
 * This module:
 * 1. Commits any staged changes on sync-branch
 * 2. Squash merges sync-branch → development
 * 3. Returns suggested commit message for user to commit
 */
import { config } from '#/config';
import { gitCommit } from '#/utils/git/command';
import { handleSquashMerge } from '#/utils/git/git-merge';
import { hasAnythingToCommit } from '#/utils/git/helpers';
import { createProgress } from '#/utils/progress';

/**
 * Squashes sync-branch into development after validation.
 *
 * @returns Suggested commit message, or null if no changes
 */
export async function runSquash(): Promise<string | null> {
  const progress = createProgress('finalizing');

  return await progress.wrap(async () => {
    // First, commit on sync-branch if there are staged changes
    // This includes: merged files, package.json updates, generated files, lint fixes
    progress.step('committing on sync-branch');

    if (await hasAnythingToCommit(config.workingDirectory)) {
      await gitCommit(
        config.workingDirectory,
        `sync: merge upstream + validate (${new Date().toISOString().split('T')[0]})`,
        { noVerify: true },
      );
    }

    // Now squash sync-branch → development
    progress.step('squashing → development');

    const commitMessage = await handleSquashMerge(config.forkLocalPath, config.forkBranchRef, config.forkSyncBranchRef);

    if (commitMessage) {
      progress.done(`changes staged on '${config.forkBranchRef}'`);
    } else {
      progress.done('no changes to squash');
    }

    return commitMessage;
  });
}
