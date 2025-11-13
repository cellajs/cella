import { MinimalRepoConfig } from "./types";

/**
 * Default configuration for the boilerplate repository.
 * The boilerplate repository contains the base files and structure
 */
export const boilerplateDefaultConfig: MinimalRepoConfig = {
  /**
   * Local file system path to the boilerplate repository (empty because differ per user).
   */
  localPath: "/home/gino/Github/cella",

  /**
   * The remote URL of the boilerplate repository
   */
  remoteUrl: "https://github.com/cellajs/cella.git",

  /**
   * The "branch" to sync from. Make sure this branch exists in the boilerplate repository.
   */
  branch: "development",

  /**
   * The sync branch (will be differ per user/repo).
   */
  syncBranch: "",

  /**
   * The name to use when adding the boilerplate repository as a remote.
   */
  remoteName: 'cella-remote',
}