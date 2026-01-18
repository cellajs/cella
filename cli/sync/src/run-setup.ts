import { config } from '#/config';
import { addAsRemote } from '#/modules/setup/add-as-remote';
import { checkCleanState } from '#/modules/setup/check-clean-state';
import { checkConfig } from '#/modules/setup/check-config';
import { checkRepository } from '#/modules/setup/check-repository';
import { fetchLatestChanges } from '#/modules/setup/fetch-latest-changes';
import { gitCheckout, gitReset } from '#/utils/git/command';
import { handleMerge } from '#/utils/git/git-merge';
import { createBranchIfMissing } from '#/utils/git/git-refs';
import { isWorkBranchAheadOfSync } from '#/utils/git/helpers';
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
     * [EXPERIMENTAL] Reset sync-branch to work-branch if work-branch is ahead.
     * This happens when the user has committed a squash merge on the work-branch.
     * Resetting ensures the commit count starts fresh for the next sync.
     */
    const workBranchAhead = await isWorkBranchAheadOfSync(
      config.workingDirectory,
      config.forkBranchRef,
      config.forkSyncBranchRef,
    );

    if (workBranchAhead) {
      await gitCheckout(config.workingDirectory, config.forkSyncBranchRef);
      await gitReset(config.workingDirectory, config.forkBranchRef, { hard: true });
    }

    /**
     * Merge development → sync-branch to incorporate any fork changes.
     * This keeps sync-branch aligned with development's content while
     * preserving its upstream commit ancestry for future syncs.
     */
    await handleMerge(config.workingDirectory, config.forkSyncBranchRef, config.forkBranchRef, null);

    // Ensure sync branch is clean post-merge
    await checkCleanState(config.workingDirectory, config.forkSyncBranchRef, { skipCheckout: true });

    progress.done('preflight complete');
  });
}
