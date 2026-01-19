/**
 * Git merge utilities.
 * Consolidated from handle-merge.ts and handle-squash-merge.ts.
 */
import { confirm } from '@inquirer/prompts';
import { config } from '#/config';
import { pauseSpinner, resumeSpinner } from '#/utils/progress';
import { gitAddAll, gitCheckout, gitCommit, gitMerge, isMergeInProgress } from './command';
import { getUnmergedFiles } from './files';
import { getCommitCount, getLastCommitMessages, hasAnythingToCommit } from './helpers';

// ─────────────────────────────────────────────────────────────────────────────
// Standard Merge
// ─────────────────────────────────────────────────────────────────────────────

/**
 * High-level function: handles merge attempt, conflict resolution, and finalization.
 *
 * @param mergeIntoPath - The file path of the repository where the merge is taking place.
 * @param mergeIntoBranch - The target branch to merge into.
 * @param mergeFromBranch - The source branch to merge from.
 * @param resolveConflicts - Optional function to automatically resolve conflicts.
 */
export async function handleMerge(
  mergeIntoPath: string,
  mergeIntoBranch: string,
  mergeFromBranch: string,
  resolveConflicts?: (() => Promise<void>) | null,
  { allowUnrelatedHistories = false } = {},
): Promise<void> {
  await gitCheckout(mergeIntoPath, mergeIntoBranch);
  await startMerge(mergeIntoPath, mergeFromBranch, { allowUnrelatedHistories });

  if (resolveConflicts) {
    await resolveConflicts();
  }

  await waitForManualConflictResolution(mergeIntoPath);

  if (await hasAnythingToCommit(mergeIntoPath)) {
    await gitCommit(mergeIntoPath, `Merge ${mergeFromBranch} into ${mergeIntoBranch}`, { noVerify: true });
  }
}

/** Starts the merge process between branches. */
async function startMerge(mergeIntoPath: string, mergeFromBranch: string, { allowUnrelatedHistories = false } = {}) {
  try {
    // Use noCommit to prevent auto-commit on clean merges.
    // This allows resolveConflicts callback to clean up ignored files before committing.
    await gitMerge(mergeIntoPath, mergeFromBranch, { noCommit: true, noEdit: true, allowUnrelatedHistories });
  } catch (err) {
    if (!isMergeInProgress(mergeIntoPath)) {
      throw err;
    }
  }
}

/** Prompts user for manual conflict resolution when conflicts remain. */
async function waitForManualConflictResolution(mergeIntoPath: string) {
  let conflicts = await getUnmergedFiles(mergeIntoPath);

  if (conflicts.length === 0) return;

  pauseSpinner();

  if (conflicts.length > 0) {
    const continueResolving = await confirm({
      message: `please resolve ${conflicts.length} merge conflicts manually (in another terminal). once resolved, press "y" to continue`,
      default: true,
    });

    if (!continueResolving) {
      throw new Error('merge process aborted by user');
    }

    resumeSpinner();
    return waitForManualConflictResolution(mergeIntoPath);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Squash Merge
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Squashes all sync-related commits from fork.sync-branch into fork.targetBranch.
 * Changes are staged but NOT committed, allowing the developer to review before committing.
 *
 * Uses config.pulledCommitCount (set during setup) for accurate commit messaging,
 * as this reflects only commits pulled in this session, not all commits on sync-branch.
 *
 * @param mergeIntoPath - The file path of the repository where the merge is taking place.
 * @param mergeIntoBranch - The target branch to merge into.
 * @param mergeFromBranch - The source branch to merge from.
 * @returns A Promise that resolves to the suggested commit message, or null if no changes.
 */
export async function handleSquashMerge(
  mergeIntoPath: string,
  mergeIntoBranch: string,
  mergeFromBranch: string,
): Promise<string | null> {
  if (!mergeIntoBranch) {
    throw new Error('mergeIntoBranch is not defined');
  }

  await gitCheckout(mergeIntoPath, mergeIntoBranch);

  // Check if there are commits to merge (sync-branch ahead of development)
  const totalAhead = await getCommitCount(mergeIntoPath, mergeFromBranch, mergeIntoBranch);
  if (!totalAhead) return null;

  await gitMerge(mergeIntoPath, mergeFromBranch, { squash: true });
  await gitAddAll(mergeIntoPath);

  // Check if there are actual staged changes after the squash merge
  const hasStagedChanges = await hasAnythingToCommit(mergeIntoPath);
  if (!hasStagedChanges) return null;

  // Use pulledCommitCount from this session (accurate), fallback to totalAhead
  const commitCount = config.pulledCommitCount || totalAhead;

  const recentMessages = config.maxSquashPreviews
    ? await getLastCommitMessages(mergeIntoPath, mergeFromBranch, mergeIntoBranch, Math.min(config.maxSquashPreviews, commitCount))
    : [];

  const commitCountText = commitCount === 1 ? '1 commit' : `${commitCount} commits`;
  let commitMessage = `chore(sync): ${commitCountText} from ${config.upstreamRemoteName}`;

  if (recentMessages.length) {
    const bullets = recentMessages.map((msg) => `- ${msg}`).join('\n');
    const remaining = commitCount - recentMessages.length;
    commitMessage += `\n\n${bullets}`;
    if (remaining > 0) {
      commitMessage += `\n- ... and ${remaining} more`;
    }
  }

  return commitMessage;
}
