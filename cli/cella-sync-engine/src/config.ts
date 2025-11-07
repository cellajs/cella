import { config } from "dotenv";

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
  targetBranch?: string;     // branch to apply resolved commits (squashed) INTO
  addAsRemoteName: string; // optional name to add the remote as
  repoPath: string;  // required if use === 'local'
  owner: string;     // required if use === 'remote'
  repo: string;      // required if use === 'remote'
};

export type Log = {
  modules?: string[];
  analyzedFile: {
    // Filters to filter analyzed files
    filePath?: string[];
    commitSummaryState?: string[];
    mergeStrategyStrategy?: string[];
  },
  analyzedSwizzle: {
    // Filters to filter swizzle analysis
    filePath?: string[];
    swizzled?: boolean;
  }
}

export const logConfig: Log = {
  modules: ['analyzedFile', 'analyzedSummary'], // 'analyzedSwizzle'
  analyzedFile: {
    // filePath: [
    //   'frontend/public/static/icons/icon-57x57.png'
    // ],
    // commitSummaryState: [
    //   "upToDate",
    //   "ahead",
    //   "behind",
    //   "diverged",
    //   "unrelated",
    //   "unknown",
    // ],
    mergeStrategyStrategy: [
      // "keep-fork",
      // "remove-from-fork",
      // "manual",
      "unknown",
    ]
  },
  analyzedSwizzle: {
    swizzled: true,
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
  addAsRemoteName: 'cella-remote',
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
  targetBranch: "development",
  repoPath: "/home/gino/Github/raak",
  addAsRemoteName: 'raak-remote',
  owner: "",  // Only used if use === 'remote'
  repo: "",   // Only used if use === 'remote'
};

export const swizzleConfig = {
  metadataVersion: '1.0.0', // Version of the swizzle metadata format
  metadataFileName: 'cella-swizzle.metadata.json', // default
  settingsFileName: 'cella-swizzle.json',   // default
  rootDir: process.cwd(),         // can be overridden per run
  
  get metadataFilePath() {
    return `${this.rootDir}/${this.metadataFileName}`;
  },
  get settingsFilePath() {
    return `${this.rootDir}/${this.settingsFileName}`;
  }
};