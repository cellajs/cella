import { RepoConfig } from '../../types/config';
import { gitCheckout, gitMerge, gitCommit, gitAddAll } from '../../utils/git/command';
import { MergeResult } from '../../types';
import { getCommitCount } from '../../utils/git/helpers';

/**
 * Squashes all sync-related commits from fork.sync-branch into fork.targetBranch
 */
export async function handleSquashMerge(
  boilerplateConfig: RepoConfig,
  forkConfig: RepoConfig,
): Promise<MergeResult> {
  try {
    if (!forkConfig.targetBranch) {
      throw new Error('forkConfig.targetBranch is not defined');
    }

    // Checkout the target branch
    await gitCheckout(forkConfig.repoPath, forkConfig.targetBranch);

    // Get the number of commits to squash
    const commitCount = await getCommitCount(forkConfig.repoPath, forkConfig.branch, forkConfig.targetBranch);

    console.log(`Squashing ${commitCount} commits from '${forkConfig.branch}' into '${forkConfig.targetBranch}'`);

    // Squash-merge sync-branch into target branch
    await gitMerge(forkConfig.repoPath, forkConfig.branch, { squash: true });

    // Add all changes to staging
    await gitAddAll(forkConfig.repoPath);

    // Commit the squashed changes
    const commitMessage = `Squash ${commitCount} commits from '${forkConfig.branch}' (boilerplate '${boilerplateConfig.branch}') into '${forkConfig.targetBranch}'`;
    await gitCommit(forkConfig.repoPath, commitMessage, { noVerify: true });

    return {
      status: 'success',
      isMerging: false,
    };
  } catch (err: any) {
    console.error('Error squashing sync commits:', err.message || err);

    console.log(err)
    return { status: 'error', isMerging: false };
  }
}
