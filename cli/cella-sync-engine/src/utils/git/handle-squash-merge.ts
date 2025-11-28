import { config } from '../../config';

import { gitCheckout, gitMerge, gitCommit, gitAddAll, gitPush } from '../../utils/git/command';
import { MergeResult } from '../../types';
import { getCommitCount, getLastCommitMessages } from '../../utils/git/helpers';
import { hasRemoteBranch } from './branches';

/**
 * Squashes all sync-related commits from fork.sync-branch into fork.targetBranch
 * 
 * @param mergeIntoPath - The file path of the repository where the merge is taking place.
 * @param mergeIntoBranch - The target branch to merge into.
 * @param mergeFromBranch - The source branch to merge from.
 * 
 * @throws Will throw an error if mergeIntoBranch is not defined or if any git operation fails.
 * @returns A Promise that resolves to a MergeResult indicating the outcome of the squash merge operation.
 */
export async function handleSquashMerge(
  mergeIntoPath: string,
  mergeIntoBranch: string,
  mergeFromBranch: string,
): Promise<MergeResult> {
  try {
    if (!mergeIntoBranch) {
      throw new Error('mergeIntoBranch is not defined');
    }

    // Checkout the target branch
    await gitCheckout(mergeIntoPath, mergeIntoBranch);

    // Get the number of commits to squash
    const commitCount = await getCommitCount(mergeIntoPath, mergeFromBranch, mergeIntoBranch);

    if (commitCount) {
      // Squash-merge sync-branch into target branch
      await gitMerge(mergeIntoPath, mergeFromBranch, { squash: true });

      // Add all changes to staging
      await gitAddAll(mergeIntoPath);

      // Get recent commit messages for preview
      const recentMessages = config.behavior.maxGitPreviewsForSquashCommits ? await getLastCommitMessages(
        mergeIntoPath,
        mergeFromBranch,
        mergeIntoBranch,
        config.behavior.maxGitPreviewsForSquashCommits,
      ) : [];

      // Commit the squashed changes
      let commitMessage = `Squash ${commitCount} commits from '${mergeFromBranch}' into '${mergeIntoBranch}'`;

      // Append recent commit messages to the commit message
      if (recentMessages.length) {
        const bullets = recentMessages.map(msg => `- ${msg}`).join('\n');
        const remaining = commitCount - recentMessages.length;

        commitMessage += `\n\n${bullets}`;
        if (remaining > 0) {
          commitMessage += `\n+${remaining} more commit${remaining > 1 ? 's' : ''}`;
        }
      }

      // Create the commit
      await gitCommit(mergeIntoPath, commitMessage, { noVerify: true });

      // Push merge result
      if (!config.behavior.skipAllPushes && await hasRemoteBranch(mergeIntoPath, mergeIntoBranch)) {
        await gitPush(mergeIntoPath, 'origin', mergeIntoBranch, { setUpstream: true });
      }
    }

    return {
      status: 'success',
      isMerging: false,
    };
  } catch (err: any) {
    console.error('Error squashing sync commits:', err.message || err);

    console.info(err)
    return { status: 'error', isMerging: false };
  }
}
