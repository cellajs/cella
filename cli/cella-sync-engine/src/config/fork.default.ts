import { RepoConfig } from "./types";

/**
 * Default configuration for the fork repository.
 * The fork repository contains the user's fork of the boilerplate repository.
 */
export const forkDefaultConfig: RepoConfig = {
  /**
   * Local file system path to the fork repository (empty because differ per user).
   */
  localPath: "/home/gino/Github/raak",

  /**
   * The remote URL of the fork repository
   */
  remoteUrl: "https://github.com/cellajs/raak.git",

  /**
   * The "branch" to sync from. Make sure this branch exists in the fork repository.
   */
  branch: "development",

  /**
   * The sync branch (will be differ per user/repo).
   */
  syncBranch: "sync-branch",

  /**
   * The name to use when adding the fork repository as a remote.
   */
  remoteName: '',
}