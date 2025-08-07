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
  filePath: string;  // required if use === 'local'
  owner: string;     // required if use === 'remote'
  repo: string;      // required if use === 'remote'
};

/**
 * Determines the verbosity and filtering behavior of logging during file sync analysis.
 *
 * - `full`: Logs everything, including up-to-date files.
 * - `summaryOnly`: Logs only the summary (no per-file logs).
 * - `relevantOnly`: Logs only files that are not clearly in sync (e.g., non-upToDate, medium/high conflict).
 * - `conflictsOnly`: Logs only files with real or likely conflicts.
 * - `none`: No logging output at all.
 */
export type LogMode =
  | 'full'
  | 'summaryOnly'
  | 'relevantOnly'
  | 'conflictsOnly'
  | 'none';

/**
 * Defines how log output should be controlled during analysis.
 *
 * @property mode - The logging verbosity/filtering mode.
 */
export type LogConfig = {
  mode: LogMode;
};

/**
 * Global configuration for logging behavior during sync analysis.
 */
export const logConfig: LogConfig = {
  mode: 'relevantOnly',
};

/**
 * Configuration for the boilerplate repository to compare against forks.
 * This is a local repository on the file system.
 */
export const boilerplateConfig: RepoConfig = {
  use: 'local',
  branch: "development",
  filePath: "/home/gino/Github/cella",
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
  filePath: "/home/gino/Github/raak",
  owner: "",  // Only used if use === 'remote'
  repo: "",   // Only used if use === 'remote'
};