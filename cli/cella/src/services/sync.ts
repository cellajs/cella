/**
 * Sync service for the cella CLI.
 *
 * Runs the merge engine directly in the fork (no worktree) so conflicts surface in the IDE, on
 * a fresh ephemeral branch cut from the trunk. The command is idempotent: if a run stops at
 * conflicts, resolve them and run `cella sync` again to finish the same merge.
 */

import type { MergeResult, RuntimeConfig } from '../config/types';
import pc from '../utils/colors';
import {
  buildEphemeralSyncBranch,
  DEFAULT_UPSTREAM_REMOTE,
  isEphemeralSyncBranch,
  resolveReleaseBase,
  resolveUpstream,
} from '../utils/config';
import {
  createSpinner,
  printFlagWarnings,
  printSummary,
  printSyncComplete,
  spinnerFail,
  spinnerSuccess,
  spinnerText,
  writeLogFile,
} from '../utils/display';
import {
  assertClean,
  commitNoEdit,
  createBranchFrom,
  deleteBranch,
  getConflictedFiles,
  getCurrentBranch,
  getShortSha,
  fetch as gitFetch,
  mergeInProgress,
  pullFastForward,
  switchBranch,
} from '../utils/git';
import { runMergeEngine } from './merge-engine';
import { runPackages } from './packages';

/** Context for the ephemeral branch a sync cycle runs on. */
interface EphemeralSyncBranch {
  /** The freshly cut ephemeral branch, e.g. `cella/sync/20260702-1430-c5a1970`. */
  ephemeral: string;
  /** The trunk the branch was cut from and PRs land into (`releaseBase`, default `main`). */
  base: string;
  /** The branch the user was on before the cycle started (for cleanup on no-op). */
  startBranch: string;
}

/**
 * Cut a fresh ephemeral sync branch from the trunk.
 *
 * Switches to `releaseBase`, fast-forwards it, fetches upstream (so the branch can be named
 * after the upstream commit), then creates `<syncBranchPrefix>/<stamp>-<sha>` so the merge
 * lands on an isolated throwaway branch rather than a long-lived integration branch.
 */
async function setupEphemeralSyncBranch(config: RuntimeConfig): Promise<EphemeralSyncBranch> {
  const { forkPath, settings } = config;
  const base = resolveReleaseBase(settings);
  const startBranch = await getCurrentBranch(forkPath);

  console.info(pc.dim(`switching to '${base}' and updating...`));
  await switchBranch(forkPath, base);
  await pullFastForward(forkPath);

  // Fetch upstream so the ephemeral branch can be named after the upstream commit.
  const { branchRef } = resolveUpstream(settings);
  await gitFetch(forkPath, DEFAULT_UPSTREAM_REMOTE);
  const shortSha = await getShortSha(forkPath, branchRef);
  const ephemeral = buildEphemeralSyncBranch(settings, shortSha);

  console.info(pc.dim(`creating ephemeral sync branch '${ephemeral}' from '${base}'...`));
  await createBranchFrom(forkPath, ephemeral, base);

  return { ephemeral, base, startBranch };
}

/**
 * Run the merge engine against the current branch (the core merge step).
 *
 * Performs the merge directly in the fork and leaves it staged: conflicted files keep their
 * markers for IDE 3-way resolution, everything else is resolved per the override rules. Called
 * by `runSyncCycle` and by the forks service.
 */
export async function runSync(config: RuntimeConfig): Promise<MergeResult> {
  createSpinner('starting sync...');

  const result = await runMergeEngine(config, {
    apply: true,
    onProgress: (message) => {
      spinnerText(message);
    },
    onStep: (label, detail) => {
      spinnerSuccess(label, detail);
      createSpinner('...');
    },
  });

  if (result.success) {
    spinnerSuccess();
  } else {
    spinnerFail('sync completed with conflicts');
  }

  // Print summary only (no file lists for sync)
  printSummary(result.summary, 'merge summary');

  // Write log file if requested
  if (config.logFile) {
    const logPath = writeLogFile(config.forkPath, result.files);
    console.info();
    console.info(pc.dim(`full file list written to: ${logPath}`));
  }

  printSyncComplete(result);

  printFlagWarnings({ hard: config.hard, unpinned: config.unpinned });

  return result;
}

/** Print the "push + open a PR" steps for a sync branch whose merge is already committed. */
function printShipSteps(ephemeral: string, base: string): void {
  console.info(pc.dim(`  git push -u origin ${ephemeral}`));
  console.info(pc.dim(`  gh pr create --base ${base} --head ${ephemeral} --fill`));
}

/** Print the "commit + push + open a PR" steps for a sync branch with a staged (uncommitted) merge. */
function printFinishSteps(ephemeral: string, base: string): void {
  console.info(pc.dim('  pnpm cella sync            # re-run to commit the merge, or:'));
  console.info(pc.dim('  git commit --no-edit'));
  printShipSteps(ephemeral, base);
}

/** Outcome of a sync cycle run on a fresh ephemeral branch. */
type SyncCycleOutcome =
  | { status: 'conflicts'; branch: EphemeralSyncBranch }
  | { status: 'staged'; branch: EphemeralSyncBranch }
  | { status: 'noop' };

/**
 * Run one sync cycle on a fresh ephemeral branch: cut the branch, merge upstream (+ packages),
 * and report the resulting state.
 *
 * - `conflicts`: merge staged with unresolved conflicts, left for IDE resolution.
 * - `staged`: clean merge staged, ready to commit.
 * - `noop`: upstream had nothing new; the throwaway branch was deleted and the original branch
 *   restored.
 */
async function runSyncCycle(config: RuntimeConfig): Promise<SyncCycleOutcome> {
  const { forkPath } = config;
  const branch = await setupEphemeralSyncBranch(config);

  const result = await runSync(config);

  if (config.settings.syncWithPackages !== false) {
    // Run package sync even when the merge left conflicts: package.json files that are
    // themselves conflicted are skipped and reported; all others are still synced.
    await runPackages(config, { conflictedFiles: result.conflicts });
  }

  if (result.conflicts.length > 0) return { status: 'conflicts', branch };

  // Nothing staged: already up to date. Clean up the throwaway branch.
  if (!mergeInProgress(forkPath)) {
    await switchBranch(forkPath, branch.startBranch === branch.ephemeral ? branch.base : branch.startBranch);
    await deleteBranch(forkPath, branch.ephemeral);
    return { status: 'noop' };
  }

  return { status: 'staged', branch };
}

/**
 * Finish an in-progress merge left by an earlier `cella sync` run on the same ephemeral branch.
 *
 * This is what makes the command idempotent: after a run stops at conflicts, resolve and stage
 * them, then run `cella sync` again. If conflicts remain we point them out and stop; once none
 * remain we commit the merge and print the ship steps.
 */
async function resumeSyncMerge(config: RuntimeConfig, branch: string): Promise<void> {
  const { forkPath, settings } = config;
  const base = resolveReleaseBase(settings);
  const conflicts = await getConflictedFiles(forkPath);

  console.info();
  if (conflicts.length > 0) {
    console.info(pc.yellow(`${conflicts.length} file(s) still conflict on '${branch}':`));
    for (const file of conflicts) console.info(pc.dim(`  ${file}`));
    console.info(
      pc.dim('resolve and stage them, then re-run `pnpm cella sync` to finish (or `git commit --no-edit`).'),
    );
    return;
  }

  await commitNoEdit(forkPath);
  console.info(pc.green(`committed the sync merge on '${branch}'. ship it:`));
  printShipSteps(branch, base);
}

/**
 * Run the standalone `cella sync` command.
 *
 * Idempotent. Behaviour depends on where you are:
 * - On a sync branch with a merge in progress: finish that merge (resume after conflicts).
 * - On a sync branch with the merge already committed: nothing to merge; print the ship steps.
 * - Anywhere else: require a clean tree, then cut a fresh ephemeral branch and merge upstream.
 */
export async function runSyncCommand(config: RuntimeConfig): Promise<void> {
  const { forkPath, settings } = config;
  const currentBranch = await getCurrentBranch(forkPath);
  const onSyncBranch = isEphemeralSyncBranch(settings, currentBranch);
  const base = resolveReleaseBase(settings);

  // Resume path: an earlier run left a merge staged on this ephemeral branch (e.g. after
  // conflicts). Re-running finishes it instead of starting over.
  if (onSyncBranch && mergeInProgress(forkPath)) {
    await resumeSyncMerge(config, currentBranch);
    return;
  }

  // On a sync branch with the merge already committed: nothing to merge, just ship it. Start a
  // new sync from the trunk instead of stacking cycles on a stale branch.
  if (onSyncBranch) {
    console.info();
    console.info(pc.green(`sync branch '${currentBranch}' is ready to ship:`));
    printShipSteps(currentBranch, base);
    console.info(pc.dim(`  (switch to '${base}' first to start a new sync)`));
    return;
  }

  // Fresh cycle: only ever cut the ephemeral branch from a clean tree.
  await assertClean(forkPath);
  const outcome = await runSyncCycle(config);
  console.info();

  if (outcome.status === 'noop') {
    console.info(pc.green('already up to date with upstream — nothing to sync.'));
    return;
  }

  const { ephemeral } = outcome.branch;
  if (outcome.status === 'conflicts') {
    console.info(pc.yellow(`conflicts on '${ephemeral}'. resolve them in your editor and stage them, then:`));
  } else {
    console.info(pc.green(`sync merge staged on '${ephemeral}'. review, then:`));
  }
  printFinishSteps(ephemeral, base);
}
