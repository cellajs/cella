/**
 * Configuration object for specifying a repository to be analyzed.
 *
 * - If `use` is `"local"`, you must provide a valid `filePath`.
 * - If `use` is `"remote"`, you must specify both `owner` and `repo`.
 *
 * @property use - Determines whether the repository is local or remote.
 * @property branch - The branch name to analyze.
 * @property filePath - Absolute path to the local repository (required if use is 'local').
 * @property owner - GitHub owner or organization name (required if use is 'remote').
 * @property repo - GitHub repository name (required if use is 'remote').
 */
export type RepoConfig = {
  use: "local" | "remote";
  branch: string;
  repoPath: string;  // required if use === 'local'
  owner: string;     // required if use === 'remote'
  repo: string;      // required if use === 'remote'
};

export type Log = {
  analyzedFile: {
    commitSummaryState?: string[];
    mergeRiskSafeByGit?: boolean;
  }
}

export const logConfig: Log = {
  analyzedFile: {
    // commitSummaryState: [
    //   "upToDate",
    //   "ahead",
    //   "behind",
    //   "diverged",
    //   "unrelated",
    //   "unknown",
    // ],
    mergeRiskSafeByGit: false, // If true, will log files that are safe by Git
  }
};

/**
 * Configuration for the boilerplate repository to compare against forks.
 * This is a local repository on the file system.
 */
export const boilerplateConfig: RepoConfig = {
  use: 'local',
  branch: "development",
  repoPath: "/home/gino/Github/cella",
  owner: "cellajs",  // Only used if use === 'remote'
  repo: "cella",     // Only used if use === 'remote'
};

/**
 * Configuration for the forked repository being compared to the boilerplate.
 * This is a local repository on the file system.
 */
export const forkConfig: RepoConfig = {
  use: 'local',
  branch: "sync-branch",
  repoPath: "/home/gino/Github/raak",
  owner: "",  // Only used if use === 'remote'
  repo: "",   // Only used if use === 'remote'
};