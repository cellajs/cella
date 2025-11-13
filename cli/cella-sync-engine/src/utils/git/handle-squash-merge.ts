import { behaviorConfig } from '../../config';

import { gitCheckout, gitMerge, gitCommit, gitAddAll, gitPush } from '../../utils/git/command';
import { MergeResult } from '../../types';
import { getCommitCount } from '../../utils/git/helpers';
import { hasRemoteBranch } from './branches';

/**
 * Squashes all sync-related commits from fork.sync-branch into fork.targetBranch
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

      // Commit the squashed changes
      const commitMessage = `Squash ${commitCount} commits from '${mergeFromBranch}' into '${mergeIntoBranch}'`;
      await gitCommit(mergeIntoPath, commitMessage, { noVerify: true });

      // Push merge result
      if (!behaviorConfig.skipAllPushes && await hasRemoteBranch(mergeIntoPath, mergeIntoBranch)) {
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
