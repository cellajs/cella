import { RepoConfig } from "../types/config";

/**
 * Configuration for the forked repository being compared to the boilerplate.
 * This is normally a local repository you want to sync with the boilerplate.
 */
export const forkConfig: RepoConfig = {
  /**
   * Our local forked repository
   */
  use: 'local',

  /**
   * The name of the "sync" branch in the forked repository
   * This branch will recieve as many commits from the boilerplate and fork as possible.
   * You will later merge this branch (with a squash) into the targetBranch (normally development).
   */
  branch: "sync-branch",

  /**
   * The final target branch you want to keep in sync with the boilerplate (Normally "development").
   * This branch will recieve a single squashed commit from the "sync" branch.
   */
  targetBranch: "development",

  /**
   * Path to the local forked repository on the file system
   */
  repoPath: "/home/gino/Github/raak",

  /**
   * The name to use when adding the forked repository as a remote to the boilerplate repository (for when we want to sync from fork to boilerplate).
   */
  addAsRemoteName: '',

  /**
   * Owner of the remote repository (only used if use === 'remote')
   */
  owner: "",

  /**
   * Name of the remote repository (only used if use === 'remote')
   */
  repo: "",

  /**
   * The remote URL of the boilerplate repository (only used if use === 'remote').
   */
  remoteUrl: '',
};