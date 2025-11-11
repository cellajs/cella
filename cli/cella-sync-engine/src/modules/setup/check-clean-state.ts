import { hasLocalBranch } from "../../utils/git/branches";
import { gitCheckout, isMergeInProgress, isRebaseInProgress } from "../../utils/git/command";
import { isRepoClean } from "../../utils/git/helpers";

/**
 * Checks if a Git repository is clean.
 * - Optionally checks out a target branch before validation.
 * - Throws an error if there are uncommitted changes, or if a merge or rebase is in progress.
 * @param repoPath - The file system path to the repository
 * @param targetBranch - The branch to check out before validation (optional)
 * @param options - Additional options
 * @param options.skipCheckout - If true, skips checking out the target branch
 * @throws If the repository is not clean
 *
 * @example
 * await checkCleanState('/path/to/repo', 'main');
 */
export async function checkCleanState(repoPath: string, targetBranch?: string, options?: { skipCheckout?: boolean }) {
  // Determine the location description for error messages
  const locationDescription = targetBranch ? `Branch '${targetBranch}' in repository at ${repoPath}` : `repository at ${repoPath}`;

  if (targetBranch && !options?.skipCheckout) {
    if (!await hasLocalBranch(repoPath, targetBranch)) {
      throw new Error(`${locationDescription} does not exist.`);
    }

    await gitCheckout(repoPath, targetBranch);
  }

  // Check for uncommitted changes
  if (!await isRepoClean(repoPath)) {
    throw new Error(`${locationDescription} has uncommitted changes. Please commit or stash them before proceeding.`);
  }

  // Check for ongoing merge
  if (isMergeInProgress(repoPath)) {
    throw new Error(`${locationDescription} has a merge in progress. Please resolve it before proceeding.`);
  }

  // Check for ongoing rebase
  if (isRebaseInProgress(repoPath)) {
    throw new Error(`${locationDescription} has a rebase in progress. Please resolve it before proceeding.`);
  }
}