import { MinimalRepoConfig } from "./types";

/**
 * Default configuration for the upstream repository.
 * The upstream repository contains the base files and structure.
 */
export const upstreamDefaultConfig: MinimalRepoConfig = {
  /**
   * Local file system path to the upstream repository (empty because differs per user).
   */
  localPath: "",

  /**
   * The remote URL of the upstream repository
   */
  remoteUrl: "https://github.com/cellajs/cella.git",

  /**
   * The "branch" to sync from. Make sure this branch exists in the upstream repository.
   */
  branch: "development",

  /**
   * The sync branch (will differ per user/repo).
   */
  syncBranch: "",

  /**
   * The name to use when adding the upstream repository as a remote.
   */
  remoteName: 'cella-upstream',
}
