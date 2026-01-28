/**
 * Git merge utilities.
 * Consolidated from handle-merge.ts and handle-squash-merge.ts.
 */
import { confirm } from '@inquirer/prompts';
import { config } from '#/config';
import { pauseSpinner, resumeSpinner } from '#/utils/progress';
import { gitAddAll, gitCheckout, gitCommit, gitDiffCheckConflictMarkers, gitMerge, isMergeInProgress } from './command';
import { getUnmergedFiles, resolveConflictAsTheirs } from './files';
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

  if (conflicts.length === 0) {
    // Even if git reports no unmerged files, check for leftover conflict markers
    // This catches cases where user staged files without resolving markers
    const filesWithMarkers = await gitDiffCheckConflictMarkers(mergeIntoPath);
    if (filesWithMarkers.length > 0) {
      pauseSpinner();
      console.error(`\n⚠️  The following files contain unresolved conflict markers:`);
      for (const file of filesWithMarkers) {
        console.error(`   • ${file}`);
      }
      const continueAnyway = await confirm({
        message:
          'These files have conflict markers (<<<<<<<, =======, >>>>>>>). Fix them and press "y" to retry, or "n" to abort.',
        default: false,
      });
      if (!continueAnyway) {
        throw new Error('merge process aborted: unresolved conflict markers detected');
      }
      resumeSpinner();
      return waitForManualConflictResolution(mergeIntoPath);
    }
    return;
  }

  pauseSpinner();

  if (conflicts.length > 0) {
    const continueResolving = await confirm({
      message: `please resolve ${conflicts.length} merge conflicts manually (in another terminal). once resolved, press "y" to continue`,
      default: true,
    });

    if (!continueResolving) {
      throw new Error('merge process aborted by user');
    }

    // Stage all changes after user resolves conflicts manually.
    // This handles edge cases like running `pnpm install` during resolution,
    // which modifies pnpm-lock.yaml and would otherwise cause "uncommitted changes" errors.
    await gitAddAll(mergeIntoPath);

    resumeSpinner();
    return waitForManualConflictResolution(mergeIntoPath);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Squash Merge
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Resolves all squash merge conflicts by accepting the incoming (theirs) version.
 *
 * During squash merge from sync-branch → development, any conflicts should be
 * resolved by accepting sync-branch content because:
 * - sync-branch already contains validated, reviewed content
 * - All conflict resolutions were already done during upstream → sync-branch merge
 * - The developer has already approved these changes via pnpm check
 *
 * @param repoPath - Path to the repository
 */
async function resolveSquashConflictsAsTheirs(repoPath: string): Promise<void> {
  const conflicts = await getUnmergedFiles(repoPath);

  for (const filePath of conflicts) {
    await resolveConflictAsTheirs(repoPath, filePath);
  }
}

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

  try {
    // Use acceptTheirs because sync-branch already has correctly resolved content:
    // - Files resolved as 'keep-fork' → sync-branch kept fork version
    // - Files resolved as 'keep-upstream' → sync-branch has upstream version
    // This prevents re-prompting for conflicts already resolved in the first merge.
    await gitMerge(mergeIntoPath, mergeFromBranch, { squash: true, acceptTheirs: true });
  } catch {
    // Squash merge can still have conflicts if development diverged from sync-branch
    // (e.g., direct commits on development after a previous sync).
    // Since sync-branch already contains validated content, auto-resolve by accepting theirs.
    await resolveSquashConflictsAsTheirs(mergeIntoPath);
  }

  await gitAddAll(mergeIntoPath);

  // Check if there are actual staged changes after the squash merge
  const hasStagedChanges = await hasAnythingToCommit(mergeIntoPath);
  if (!hasStagedChanges) return null;

  // Use pulledCommitCount from this session (accurate), fallback to totalAhead
  const commitCount = config.pulledCommitCount || totalAhead;

  // Use pre-captured commit messages from upstream (captured before merges in runSetup)
  // This avoids polluted messages from merge commits on sync-branch
  const recentMessages =
    config.pulledCommitMessages.length > 0
      ? config.pulledCommitMessages
      : config.maxSquashPreviews
        ? await getLastCommitMessages(
            mergeIntoPath,
            config.upstreamBranchRef,
            config.forkSyncBranchRef,
            Math.min(config.maxSquashPreviews, commitCount),
          )
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
