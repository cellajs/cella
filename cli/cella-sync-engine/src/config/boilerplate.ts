import { RepoConfig } from "../types/config";

/**
 * Configuration for the boilerplate repository to compare against forks.
 * This is a local repository on the file system.
 */
export const boilerplateConfig: RepoConfig = {
  /**
   * Use our local repository for the boilerplate.
   */
  use: 'local',

  /**
   * The branch to compare against in the boilerplate repository.
   */
  branch: "development",

  /**
   * The local file system path to the boilerplate repository.
   */
  repoPath: "/home/gino/Github/cella",
  
  /**
   * The name to use when adding the boilerplate repository as a remote.
   */
  addAsRemoteName: 'cella-remote',

  /**
   * The owner of the boilerplate repository (only used if use === 'remote').
   */
  owner: "cellajs",

  /**
   * The name of the boilerplate repository (only used if use === 'remote').
   */
  repo: "cella",

  /**
   * The remote URL of the boilerplate repository (only used if use === 'remote').
   */
  remoteUrl: "https://github.com/cellajs/cella.git",
}