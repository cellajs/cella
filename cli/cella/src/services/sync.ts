/**
 * Sync service for the cella CLI.
 *
 * Runs the merge engine directly in the fork (no worktree) so conflicts surface in the IDE, on
 * a fresh temporary branch cut from the trunk. The command is idempotent: if a run stops at
 * conflicts, resolve them and run `cella sync` again to finish the same merge.
 */

import { spawnSync } from 'node:child_process';
import type { MergeResult, RuntimeConfig } from '../config/types';
import pc from '../utils/colors';
import { buildTemporarySyncBranch, isTemporarySyncBranch, resolveReleaseBase } from '../utils/config';
import {
  checkMark,
  createSpinner,
  printFlagWarnings,
  printSummary,
  printSyncComplete,
  spinnerFail,
  spinnerSuccess,
  spinnerText,
  warningMark,
  writeLogFile,
} from '../utils/display';
import {
  assertClean,
  commitSquash,
  createBranchFrom,
  deleteBranch,
  getConflictedFiles,
  getCurrentBranch,
  getShortSha,
  getUpstreamStatus,
  isClean,
  mergeInProgress,
  pullFastForward,
  pushBranch,
  stageAll,
  switchBranch,
} from '../utils/git';
import { runMergeEngine } from './merge-engine';
import { runPackages } from './packages';

/** Context for the temporary branch a sync cycle runs on. */
interface TemporarySyncBranch {
  /** The freshly cut temporary branch, e.g. `cella/sync/20260702-1430`. */
  temporaryBranch: string;
  /** The trunk the branch was cut from and PRs land into (`releaseBase`, default `main`). */
  base: string;
  /** The branch the user was on before the cycle started (for cleanup on no-op). */
  startBranch: string;
}

/**
 * Make sure the trunk is current with its remote before a sync cycle cuts a branch from it.
 *
 * Fetches the trunk's upstream and reacts to how local compares:
 * - behind (fast-forwardable): fast-forward it so the branch is cut from the latest trunk.
 * - diverged (local commits the remote lacks *and* vice versa): abort with guidance, since
 *   syncing onto a stale/diverged trunk produces a PR against an out-of-date base and avoidable
 *   conflicts.
 * - ahead-only / up to date / no upstream (local-only repo): fine, just note it and continue.
 */
async function ensureBaseUpToDate(forkPath: string, base: string): Promise<void> {
  const { upstream, ahead, behind } = await getUpstreamStatus(forkPath);

  if (!upstream) {
    console.info(pc.dim(`'${base}' has no upstream — skipping the up-to-date check.`));
    return;
  }

  if (ahead > 0 && behind > 0) {
    throw new Error(
      `'${base}' has diverged from '${upstream}' (${ahead} ahead, ${behind} behind).\n` +
        `Reconcile '${base}' with '${upstream}' first (e.g. rebase or reset it), then re-run sync.`,
    );
  }

  if (behind > 0) {
    console.info(pc.dim(`fast-forwarding '${base}' to '${upstream}' (${behind} behind)...`));
    await pullFastForward(forkPath);
    return;
  }

  if (ahead > 0) {
    console.info(pc.dim(`'${base}' is ${ahead} commit(s) ahead of '${upstream}' (unpushed) — continuing.`));
  }
}

/**
 * Cut a fresh temporary sync branch from the trunk.
 *
 * Switches to `releaseBase`, fast-forwards it, then creates `<syncBranchPrefix>/<stamp>` so the
 * merge lands on an isolated throwaway branch rather than a long-lived integration branch.
 */
async function setupTemporarySyncBranch(config: RuntimeConfig): Promise<TemporarySyncBranch> {
  const { forkPath, settings } = config;
  const base = resolveReleaseBase(settings);
  const startBranch = await getCurrentBranch(forkPath);

  console.info(pc.dim(`switching to '${base}' and updating...`));
  await switchBranch(forkPath, base);
  await ensureBaseUpToDate(forkPath, base);

  const temporaryBranch = buildTemporarySyncBranch(settings);

  console.info(pc.dim(`creating temporary sync branch '${temporaryBranch}' from '${base}'...`));
  console.info();
  await createBranchFrom(forkPath, temporaryBranch, base);

  return { temporaryBranch, base, startBranch };
}

/**
 * Run the merge engine against the current branch (the core merge step).
 *
 * Performs the merge directly in the fork and leaves it staged: conflicted files keep their
 * markers for IDE 3-way resolution, everything else is resolved per the override rules. Called
 * by `runSyncCycle` and by the forks service.
 */
export async function runSync(
  config: RuntimeConfig,
  options?: {
    onAfterSummary?: (result: MergeResult) => void;
  },
): Promise<MergeResult> {
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
  options?.onAfterSummary?.(result);

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

/** Conventional PR title required by release-please. */
const SYNC_PR_TITLE = 'chore: sync upstream cella';

/** Print the GitHub CLI command for opening the finished sync PR. */
function printPrCreateStep(branch: string, base: string): void {
  console.info(pc.dim(`  gh pr create --base ${base} --head ${branch} --title "${SYNC_PR_TITLE}" --fill`));
}

/** Print the "push + open a PR" steps for a sync branch whose merge is already committed. */
function printShipSteps(temporaryBranch: string, base: string): void {
  console.info(pc.dim(`  git push -u origin ${temporaryBranch}`));
  printPrCreateStep(temporaryBranch, base);
}

/** Guidance shown after a fresh cycle stages a merge: re-run to finish and ship it. */
function printFinishSteps(): void {
  console.info(pc.dim('  pnpm cella sync'));
}

/** Whether sync applied changes that need a finishing rerun. */
function hasStagedSyncChanges(result: MergeResult): boolean {
  const { summary } = result;
  return summary.behind + summary.diverged + summary.renamed + summary.ignored + summary.pinned > 0;
}

/** Guidance shown immediately after a clean sync summary. */
function printCleanSyncNextStep(branch: string): void {
  console.info();
  console.info(`${checkMark} ${pc.green(`Sync merge staged on '${branch}'. No conflicts. Review, then finish with:`)}`);
  printFinishSteps();
  console.info(pc.dim('  rerun commits the sync, pushes the branch, and opens a PR.'));
}

/** Whether the GitHub CLI is available on PATH. */
function ghAvailable(): boolean {
  return spawnSync('gh', ['--version'], { stdio: 'ignore' }).status === 0;
}

/**
 * Push the finished sync branch to `origin`, open a PR into the trunk, and switch back to the
 * trunk. Runs automatically once a rerun completes the merge cleanly.
 *
 * Every step degrades gracefully: a failed push (no `origin`, auth) prints the manual steps and
 * leaves you on the branch; a missing/failed `gh` (or an existing PR) prints the `gh` command but
 * still returns you to the trunk since the branch is already pushed.
 */
async function shipSyncBranch(config: RuntimeConfig, branch: string): Promise<void> {
  const { forkPath, settings } = config;
  const base = resolveReleaseBase(settings);

  console.info(pc.dim(`pushing '${branch}' to origin...`));
  try {
    await pushBranch(forkPath, 'origin', branch);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.info(pc.yellow(`push failed (${detail.split('\n')[0]}). finish manually:`));
    printShipSteps(branch, base);
    return;
  }

  if (ghAvailable()) {
    console.info(pc.dim('opening a pull request...'));
    const pr = spawnSync('gh', ['pr', 'create', '--base', base, '--head', branch, '--title', SYNC_PR_TITLE, '--fill'], {
      cwd: forkPath,
      stdio: 'inherit',
    });
    if (pr.status !== 0) {
      console.info(pc.yellow('could not open the PR automatically (it may already exist). open it with:'));
      printPrCreateStep(branch, base);
    }
  } else {
    console.info(pc.yellow('`gh` not found — open the PR manually:'));
    printPrCreateStep(branch, base);
  }

  console.info(pc.dim(`switching back to '${base}'...`));
  await switchBranch(forkPath, base);
  await pullFastForward(forkPath).catch(() => {});
  console.info(pc.green(`done — '${branch}' is pushed and you're back on '${base}'.`));
}

/**
 * Reconcile dependencies and regenerate derived files before committing a resumed merge.
 *
 * A sync merge (plus package.json key-sync) changes `package.json`, which leaves the lockfile
 * and generated files (SDK, etc.) stale and often unstaged. Mirroring what lefthook would do —
 * but up front — we run `pnpm install` then `pnpm check`, so the merge commit is complete and
 * consistent. Returns false if a step fails (the merge is left in progress to retry).
 */
function finalizeWorkspace(forkPath: string): boolean {
  for (const args of [['install'], ['check']]) {
    console.info(pc.dim(`running pnpm ${args.join(' ')}...`));
    const result = spawnSync('pnpm', args, { cwd: forkPath, stdio: 'inherit' });
    if (result.status !== 0) return false;
  }
  return true;
}

/** Outcome of a sync cycle run on a fresh temporary branch. */
type SyncCycleOutcome =
  | { status: 'conflicts'; branch: TemporarySyncBranch }
  | { status: 'staged'; branch: TemporarySyncBranch }
  | { status: 'noop' };

/**
 * Run one sync cycle on a fresh temporary branch: cut the branch, merge upstream (+ packages),
 * and report the resulting state.
 *
 * - `conflicts`: merge staged with unresolved conflicts, left for IDE resolution.
 * - `staged`: clean merge staged, ready to commit.
 * - `noop`: upstream had nothing new; the throwaway branch was deleted and the original branch
 *   restored.
 */
async function runSyncCycle(config: RuntimeConfig): Promise<SyncCycleOutcome> {
  const { forkPath } = config;
  const branch = await setupTemporarySyncBranch(config);

  const result = await runSync(config, {
    onAfterSummary: (syncResult) => {
      if (syncResult.conflicts.length === 0 && hasStagedSyncChanges(syncResult)) {
        printCleanSyncNextStep(branch.temporaryBranch);
      }
    },
  });

  if (config.settings.syncWithPackages !== false) {
    // Run package sync even when the merge left conflicts: package.json files that are
    // themselves conflicted are skipped and reported; all others are still synced.
    await runPackages(config, { conflictedFiles: result.conflicts });
  }

  if (result.conflicts.length > 0) return { status: 'conflicts', branch };

  // Nothing staged: already up to date. Clean up the throwaway branch.
  if (!mergeInProgress(forkPath)) {
    await switchBranch(forkPath, branch.startBranch === branch.temporaryBranch ? branch.base : branch.startBranch);
    await deleteBranch(forkPath, branch.temporaryBranch);
    return { status: 'noop' };
  }

  return { status: 'staged', branch };
}

/**
 * Finish an in-progress merge left by an earlier `cella sync` run on the same temporary branch.
 *
 * This is what makes the command idempotent: after a run stops at conflicts, resolve and stage
 * them, then run `cella sync` again. If conflicts remain we point them out and stop; once none
 * remain we reconcile dependencies (`pnpm install` + `pnpm check`), stage everything, commit the
 * staged delta as a single squashed commit (see `commitSquash`), then push the branch and open
 * the PR (see `shipSyncBranch`).
 */
async function resumeSyncMerge(config: RuntimeConfig, branch: string): Promise<void> {
  const { forkPath } = config;
  const conflicts = await getConflictedFiles(forkPath);

  console.info();
  if (conflicts.length > 0) {
    console.info(pc.yellow(`${conflicts.length} file(s) still conflict on '${branch}':`));
    for (const file of conflicts) console.info(pc.dim(`  ${file}`));
    console.info(pc.dim('resolve and stage them, then re-run `pnpm cella sync` to finish.'));
    return;
  }

  // Stage everything up front (resolved conflicts + any manual edits) before running tooling that
  // may fail: `finalizeWorkspace` returns early on a failing `pnpm check`, so staging afterwards
  // would never happen and the edits would never be recorded in the merge.
  await stageAll(forkPath);

  // Reconcile deps + regenerate derived files (package.json key-sync and the merge both touch
  // package.json, leaving the lockfile and generated files stale/unstaged).
  if (!finalizeWorkspace(forkPath)) {
    console.info();
    console.info(
      pc.yellow('`pnpm install`/`pnpm check` failed. fix the issues, then re-run `pnpm cella sync` to finish.'),
    );
    return;
  }

  // Read the merged upstream sha before squashing (commitSquash clears MERGE_HEAD), re-stage (the
  // install/check step may have touched files), then commit the staged delta as a single-parent
  // commit so the PR shows one clean commit instead of the whole upstream history (the merge's
  // upstream ancestry isn't shared on the remote).
  const upstreamSha = await getShortSha(forkPath, 'MERGE_HEAD').catch(() => '');
  await stageAll(forkPath);
  const message = upstreamSha ? `${SYNC_PR_TITLE} ${upstreamSha}` : SYNC_PR_TITLE;
  await commitSquash(forkPath, message);
  console.info();
  console.info(pc.green(`committed the sync on '${branch}' as '${message}'.`));
  await shipSyncBranch(config, branch);
}

/**
 * Run the standalone `cella sync` command.
 *
 * Idempotent. Behaviour depends on where you are:
 * - On a sync branch with a merge in progress: finish that merge (resume after conflicts), then
 *   push and open the PR.
 * - On a sync branch with the merge already committed: push and open the PR (e.g. a previous
 *   push failed), then switch back to the trunk.
 * - Anywhere else: require a clean tree, then cut a fresh temporary branch and merge upstream.
 */
export async function runSyncCommand(config: RuntimeConfig): Promise<void> {
  const { forkPath, settings } = config;
  const currentBranch = await getCurrentBranch(forkPath);
  const onSyncBranch = isTemporarySyncBranch(settings, currentBranch);

  // Resume path: an earlier run left a merge staged on this temporary branch (e.g. after
  // conflicts). Re-running finishes it instead of starting over.
  if (onSyncBranch && mergeInProgress(forkPath)) {
    await resumeSyncMerge(config, currentBranch);
    return;
  }

  // On a sync branch with the merge already committed: ship it (push + PR + back to trunk).
  if (onSyncBranch) {
    // shipSyncBranch only pushes HEAD, so any edits made after the squash commit would be silently
    // left out of the pushed branch/PR. Refuse to ship over a dirty tree and make them commit.
    if (!(await isClean(forkPath))) {
      console.info();
      console.info(
        pc.yellow(
          `sync branch '${currentBranch}' has uncommitted changes that would not be shipped.\n` +
            'commit them (`git commit --amend --no-edit` or a new commit), then re-run `pnpm cella sync`.',
        ),
      );
      return;
    }
    console.info();
    console.info(pc.green(`sync branch '${currentBranch}' is already committed.`));
    await shipSyncBranch(config, currentBranch);
    return;
  }

  // Fresh cycle: only ever cut the temporary branch from a clean tree.
  await assertClean(forkPath);
  const outcome = await runSyncCycle(config);
  console.info();

  if (outcome.status === 'noop') {
    console.info(pc.green('already up to date with upstream — nothing to sync.'));
    return;
  }

  const { temporaryBranch } = outcome.branch;
  if (outcome.status === 'conflicts') {
    console.info(`${warningMark} ${pc.yellow(`conflicts on '${temporaryBranch}'. Resolve them and then:`)}`);
    printFinishSteps();
  }
}
