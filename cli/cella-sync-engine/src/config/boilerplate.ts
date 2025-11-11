import { RepoConfig } from "../types/config";

/**
 * Configuration for the boilerplate repository.
 * The boilerplate repository contains the base files and structure
 * These will be used to:
 * - analyze changes
 * - sync updates to the target repositories (forks)
 */
export const boilerplateConfig: RepoConfig = {
  /**
   * The boilerplate can be either 'local' or 'remote'.
   * 'local' uses a local file system path.
   * 'remote' uses a remote Git repository.
   */
  use: 'remote',

  /**
   * The local file system path to the boilerplate repository.
   * - For `remote` repos, this is the path where the repo was cloned to (fork path)
   */
  repoPath: "/home/gino/Github/raak",

  /**
   * The remote URL of the boilerplate repository (only used if use === 'remote').
   */
  remoteUrl: "https://github.com/cellajs/cella.git",

  /**
   * This branch will be used to sync from.
   * Make sure this branch exists in the boilerplate repository.
   */
  branch: "development",

  /**
   * The target branch to apply resolved (squashed) commits into.
   */
  targetBranch: "",

  /**
   * The name to use when adding the boilerplate repository as a remote (only used if use === 'remote').
   */
  remoteName: 'cella-remote',
}