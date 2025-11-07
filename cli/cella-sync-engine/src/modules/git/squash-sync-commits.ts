import { RepoConfig } from '../../config';
import { gitCheckout, gitMerge, gitCommit, gitAddAll } from '../../utils/git/command';
import { MergeResult } from '../../types';
import { getCommitCount } from '../../utils/git/helpers';

/**
 * Squashes all sync-related commits from fork.sync-branch into fork.targetBranch
 */
export async function squashSyncCommits(
  boilerplateConfig: RepoConfig,
  forkConfig: RepoConfig,
): Promise<MergeResult> {
  try {
    if (!forkConfig.targetBranch) {
      throw new Error('forkConfig.targetBranch is not defined');
    }

    const syncBranch = forkConfig.branch;       // the working sync-branch
    const targetBranch = forkConfig.targetBranch; // the main branch to squash into

    // Checkout the target branch
    await gitCheckout(forkConfig.repoPath, targetBranch);

    // Get the number of commits to squash
    const commitCount = await getCommitCount(forkConfig.repoPath, syncBranch, targetBranch);

    // Squash-merge sync-branch into target branch
    await gitMerge(forkConfig.repoPath, syncBranch, { squash: true, noEdit: true, noCommit: true });

    // Add all changes to staging
    await gitAddAll(forkConfig.repoPath);

    // Commit the squashed changes
    const commitMessage = `Squash ${commitCount} commits from '${syncBranch}' (boilerplate '${boilerplateConfig.branch}') into '${targetBranch}'`;
    await gitCommit(forkConfig.repoPath, commitMessage, { noVerify: true });

    return {
      status: 'success',
      isMerging: false,
    };
  } catch (err: any) {
    console.error('Error squashing sync commits:', err.message || err);
    return { status: 'error', isMerging: false };
  }
}
