/**
 * Release service for sync CLI v2.
 *
 * Orchestrates a full upstream-sync release cycle on a throwaway, uniquely named
 * integration branch cut fresh from the trunk (`main`):
 *
 *   trunk ──▶ cella-sync/<stamp>-<sha> ──(sync merge + commit)──▶ push ──▶ PR ──(squash)──▶ trunk
 *
 * Cutting a fresh branch per cycle keeps every PR scoped to that sync's upstream delta
 * (no accumulation of previously squash-merged commits) while keeping `main` linear.
 * Upstream ancestry for the merge-base is carried by `refs/cella/last-sync` (written by
 * the sync engine), so the ephemeral branch can be deleted after each cycle.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { RuntimeConfig } from '../config/types';
import pc from '../utils/colors';
import {
  buildEphemeralSyncBranch,
  DEFAULT_UPSTREAM_REMOTE,
  resolveReleaseBase,
  resolveUpstream,
} from '../utils/config';
import {
  assertClean,
  commitNoEdit,
  createBranchFrom,
  deleteBranch,
  getCurrentBranch,
  getShortSha,
  fetch as gitFetch,
  mergeInProgress,
  pullFastForward,
  pushBranch,
  switchBranch,
} from '../utils/git';
import { runPackages } from './packages';
import { runSync } from './sync';

const execFileAsync = promisify(execFile);

type GhResult = { ok: boolean; stdout: string; stderr: string };

/** Run a `gh` command, capturing output without throwing. */
async function gh(args: string[], cwd: string): Promise<GhResult> {
  try {
    const { stdout, stderr } = await execFileAsync('gh', args, { cwd });
    return { ok: true, stdout: stdout.trim(), stderr: stderr.trim() };
  } catch (error) {
    const e = error as { stdout?: string; stderr?: string; message?: string };
    return { ok: false, stdout: (e.stdout ?? '').trim(), stderr: (e.stderr ?? e.message ?? '').trim() };
  }
}

async function ghAvailable(cwd: string): Promise<boolean> {
  return (await gh(['--version'], cwd)).ok;
}

/**
 * Run the release service: sync upstream on an ephemeral branch and open (optionally
 * squash-merge) a PR into the trunk.
 */
export async function runRelease(config: RuntimeConfig): Promise<void> {
  const { forkPath, settings } = config;
  const push = config.releasePush !== false;
  const autoMerge = config.releaseAutoMerge === true;

  await assertClean(forkPath);

  const base = resolveReleaseBase(settings);
  const startBranch = await getCurrentBranch(forkPath);

  // Update the trunk so the ephemeral branch starts from the latest release-please state.
  console.info(pc.dim(`switching to '${base}' and updating...`));
  await switchBranch(forkPath, base);
  await pullFastForward(forkPath);

  // Fetch upstream so we can name the ephemeral branch after the upstream commit.
  const { branchRef } = resolveUpstream(settings);
  await gitFetch(forkPath, DEFAULT_UPSTREAM_REMOTE);
  const shortSha = await getShortSha(forkPath, branchRef);
  const ephemeral = buildEphemeralSyncBranch(settings, shortSha);

  console.info(pc.dim(`creating ephemeral sync branch '${ephemeral}' from '${base}'...`));
  await createBranchFrom(forkPath, ephemeral, base);

  // Reuse the sync service (+ packages) on the ephemeral branch.
  const syncConfig: RuntimeConfig = { ...config, service: 'sync' };
  const result = await runSync(syncConfig);
  if (settings.syncWithPackages !== false) {
    await runPackages(syncConfig, { conflictedFiles: result.conflicts });
  }

  // Conflicts: stop and let the user resolve in the IDE, then finish manually.
  if (result.conflicts.length > 0) {
    console.info();
    console.info(pc.yellow(`conflicts remain on '${ephemeral}'. resolve them, then:`));
    console.info(pc.dim('  git commit --no-edit'));
    console.info(pc.dim(`  git push -u origin ${ephemeral}`));
    console.info(pc.dim(`  gh pr create --base ${base} --head ${ephemeral} --fill`));
    return;
  }

  // No merge staged: already up to date. Clean up the ephemeral branch.
  if (!mergeInProgress(forkPath)) {
    console.info();
    console.info(pc.green('already up to date with upstream — nothing to release.'));
    await switchBranch(forkPath, startBranch === ephemeral ? base : startBranch);
    await deleteBranch(forkPath, ephemeral);
    return;
  }

  // Commit the two-parent merge commit.
  await commitNoEdit(forkPath);
  console.info(pc.green(`committed sync merge on '${ephemeral}'.`));

  if (!push) {
    console.info(pc.dim('branch left local (--no-push). push + open a PR when ready:'));
    console.info(pc.dim(`  git push -u origin ${ephemeral}`));
    console.info(pc.dim(`  gh pr create --base ${base} --head ${ephemeral} --fill`));
    return;
  }

  await pushBranch(forkPath, 'origin', ephemeral);
  console.info(pc.green(`pushed '${ephemeral}' to origin.`));

  if (!(await ghAvailable(forkPath))) {
    console.info(pc.yellow('gh CLI not found — open the PR manually:'));
    console.info(pc.dim(`  gh pr create --base ${base} --head ${ephemeral} --fill`));
    return;
  }

  const title = `chore: sync upstream cella ${shortSha}`;
  const created = await gh(
    [
      'pr',
      'create',
      '--base',
      base,
      '--head',
      ephemeral,
      '--title',
      title,
      '--body',
      'Automated upstream sync via `cella release`.',
    ],
    forkPath,
  );
  if (!created.ok) {
    console.info(pc.yellow('could not create the PR automatically:'));
    console.info(pc.dim(`  ${created.stderr}`));
    return;
  }
  console.info(pc.green(`opened PR: ${created.stdout}`));

  if (!autoMerge) {
    console.info(pc.dim(`review, then: gh pr merge ${ephemeral} --squash --delete-branch`));
    return;
  }

  const merged = await gh(['pr', 'merge', ephemeral, '--squash', '--delete-branch'], forkPath);
  if (!merged.ok) {
    console.info(pc.yellow('auto squash-merge failed (branch protection or checks pending):'));
    console.info(pc.dim(`  ${merged.stderr}`));
    return;
  }
  console.info(pc.green(`squash-merged into '${base}'.`));

  // Realign the local trunk and drop the now-merged ephemeral branch.
  await switchBranch(forkPath, base);
  await pullFastForward(forkPath);
  await deleteBranch(forkPath, ephemeral);
  console.info(pc.green(`back on '${base}', ephemeral branch cleaned up.`));
}
