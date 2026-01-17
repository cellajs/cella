import { config } from '../../config';

import { gitAddAll, gitCheckout, gitMerge } from '../../utils/git/command';
import { getCommitCount, getLastCommitMessages } from '../../utils/git/helpers';

/**
 * Squashes all sync-related commits from fork.sync-branch into fork.targetBranch.
 * Changes are staged but NOT committed, allowing the developer to review before committing.
 *
 * @param mergeIntoPath - The file path of the repository where the merge is taking place.
 * @param mergeIntoBranch - The target branch to merge into.
 * @param mergeFromBranch - The source branch to merge from.
 *
 * @throws Will throw an error if mergeIntoBranch is not defined or if any git operation fails.
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

  // Checkout the target branch
  await gitCheckout(mergeIntoPath, mergeIntoBranch);

  // Get the number of commits to squash
  const commitCount = await getCommitCount(mergeIntoPath, mergeFromBranch, mergeIntoBranch);

  if (!commitCount) {
    return null;
  }

  // Squash-merge sync-branch into target branch (stages changes, does not commit)
  await gitMerge(mergeIntoPath, mergeFromBranch, { squash: true });

  // Add all changes to staging
  await gitAddAll(mergeIntoPath);

  // Get recent commit messages for preview
  const recentMessages = config.behavior.maxGitPreviewsForSquashCommits
    ? await getLastCommitMessages(
        mergeIntoPath,
        mergeFromBranch,
        mergeIntoBranch,
        config.behavior.maxGitPreviewsForSquashCommits,
      )
    : [];

  // Build suggested commit message
  let commitMessage = `Sync upstream: ${commitCount} commit${commitCount > 1 ? 's' : ''} from '${mergeFromBranch}'`;

  // Append recent commit messages
  if (recentMessages.length) {
    const bullets = recentMessages.map((msg) => `- ${msg}`).join('\n');
    const remaining = commitCount - recentMessages.length;

    commitMessage += `\n\n${bullets}`;
    if (remaining > 0) {
      commitMessage += `\n+${remaining} more commit${remaining > 1 ? 's' : ''}`;
    }
  }

  return commitMessage;
}
