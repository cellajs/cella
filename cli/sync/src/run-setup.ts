import { config } from '#/config';
import { getOverrideStatus } from '#/modules/overrides';
import { addAsRemote } from '#/modules/setup/add-as-remote';
import { checkCleanState } from '#/modules/setup/check-clean-state';
import { checkConfig } from '#/modules/setup/check-config';
import { checkRepository } from '#/modules/setup/check-repository';
import { fetchLatestChanges } from '#/modules/setup/fetch-latest-changes';
import { gitAdd, gitCheckoutFileFromRef, gitCleanUntrackedFile, gitRemoveFilePathFromCache } from '#/utils/git/command';
import { getUnmergedFiles } from '#/utils/git/files';
import { handleMerge } from '#/utils/git/git-merge';
import { createBranchIfMissing } from '#/utils/git/git-refs';
import { getCommitCount, getLastCommitMessages } from '#/utils/git/helpers';
import { createProgress } from '#/utils/progress';

/**
 * Performs all preflight setup steps required before running any sync operations.
 *
 * Responsibilities:
 *
 * 1. **Configuration validation**
 *    Ensures required properties exist in both upstream and fork configurations:
 *    - `branchRef`
 *    - `syncBranchRef` (fork only)
 *    - `repoReference`
 *
 * 2. **Repository accessibility checks**
 *    Verifies that both repositories can be accessed via the provided paths or remotes.
 *
 * 3. **Remote setup**
 *    Ensures the upstream repository is added as a remote in the fork repository.
 *
 * 4. **Working directory cleanliness**
 *    Validates that the fork repository is in a clean state:
 *    - working directory clean
 *    - target branch clean
 *    - sync branch exists and is clean
 *
 * 5. **Branch and remote preparation**
 *    Creates missing branches (sync branch) and fetches latest commits for both repositories.
 *
 * 6. **Sync branch alignment**
 *    Merges the fork branch into the sync branch to ensure it's up-to-date.
 *
 * @throws Will throw an error if any setup step fails (invalid config, inaccessible repository, unclean state, etc.)
 * @returns A promise that resolves when setup is complete.
 *
 * @example
 * await runSetup();
 */
export async function runSetup() {
  const progress = createProgress('preflight');

  await progress.wrap(async () => {
    // Basic configuration validation
    checkConfig(config.upstream, [
      { prop: 'branchRef', required: true },
      { prop: 'repoReference', required: true },
    ]);

    checkConfig(config.fork, [
      { prop: 'branchRef', required: true },
      { prop: 'syncBranchRef', required: true },
      { prop: 'repoReference', required: true },
    ]);

    progress.step('verifying repositories');

    // Verify repository accessibility
    await checkRepository(config.upstream);
    await checkRepository(config.fork);

    progress.step('configuring upstream remote');

    // Ensure upstream is added as a remote in the fork
    await addAsRemote(config.upstream, config.fork);

    progress.step('checking clean state');

    // Ensure fork working directory and branches are clean
    await checkCleanState(config.workingDirectory);
    await checkCleanState(config.workingDirectory, config.forkBranchRef);

    progress.step('preparing sync branch');

    /**
     * sync-branch maintains full git ancestry with upstream.
     *
     * It contains actual upstream merge commits (not squashed), which allows:
     * - Accurate "commits behind" detection via shared commit SHAs
     * - Proper three-way merges with conflict detection
     * - Git merge-base calculations to work correctly
     *
     * Without sync-branch, we can't determine which upstream commits were
     * already synced (development has squashed commits with different SHAs).
     */
    await createBranchIfMissing(config.workingDirectory, config.forkSyncBranchRef);
    await checkCleanState(config.workingDirectory, config.forkSyncBranchRef);

    progress.step('fetching latest changes');

    // Fetch latest changes for both repositories
    await fetchLatestChanges(config.upstream);
    await fetchLatestChanges(config.fork);

    progress.step('updating sync branch');

    /**
     * First, merge development → sync-branch to align sync-branch with current fork state.
     * This prevents double-conflicts during the squash merge back to development.
     *
     * Then merge upstream → sync-branch to incorporate latest upstream changes.
     * sync-branch maintains full upstream commit history (not squashed),
     * which allows accurate file-level commit analysis and merge-base detection.
     */

    // Count commits that will be pulled BEFORE merging (for accurate squash message)
    // Compare upstream against sync-branch to see what's new from upstream
    const pulledCount = await getCommitCount(
      config.workingDirectory,
      config.upstreamBranchRef,
      config.forkSyncBranchRef,
    );
    config.pulledCommitCount = pulledCount;

    // Capture commit messages from upstream BEFORE merging
    // This gives us clean upstream messages without merge commit noise
    if (pulledCount > 0 && config.maxSquashPreviews) {
      const messages = await getLastCommitMessages(
        config.workingDirectory,
        config.upstreamBranchRef,
        config.forkSyncBranchRef,
        Math.min(config.maxSquashPreviews, pulledCount),
      );
      config.pulledCommitMessages = messages;
    }

    // Merge development → sync-branch (align with fork's current state)
    // This ensures sync-branch has fork's content before analyzing and applying upstream changes.
    // This should be conflict-free since sync-branch is an ancestor of development
    // (or identical if no new commits on development since last sync).
    // However, if sync-branch has previously synced ignored files (api.gen, etc.), conflicts may occur.
    await handleMerge(config.workingDirectory, config.forkSyncBranchRef, config.forkBranchRef, async () => {
      // Resolve conflicts for ignored/pinned files by keeping development (fork) version
      const conflicts = await getUnmergedFiles(config.workingDirectory);
      for (const filePath of conflicts) {
        const overrideStatus = getOverrideStatus(filePath);
        if (overrideStatus === 'ignored' || overrideStatus === 'pinned') {
          try {
            await gitCheckoutFileFromRef(config.workingDirectory, filePath, config.forkBranchRef);
            await gitAdd(config.workingDirectory, filePath);
          } catch {
            // File doesn't exist in fork - remove it
            await gitRemoveFilePathFromCache(config.workingDirectory, filePath);
            await gitCleanUntrackedFile(config.workingDirectory, filePath);
          }
        }
      }
    });

    // NOTE: We intentionally do NOT merge upstream here.
    // The upstream merge happens in runSync() AFTER analyze, so that:
    // 1. Analysis compares upstream vs fork's current state (not already-merged state)
    // 2. Conflict resolution can use the analyzed override strategies (pinned/ignored)

    // Ensure sync branch is clean post-merge
    await checkCleanState(config.workingDirectory, config.forkSyncBranchRef, { skipCheckout: true });

    progress.done('preflight complete');
  });
}
