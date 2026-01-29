/** CLI options parsed from command line arguments */
export interface CLIOptions {
  skipNewBranch: boolean;
  skipClean: boolean;
  skipGit: boolean;
  skipInstall: boolean;
  skipGenerate: boolean;
  newBranchName?: string;
  template?: string;
}

/** CLI configuration state */
export interface CLIConfig {
  options: CLIOptions;
  args: string[];
  directory: string | null;
  newBranchName: string | null;
  createNewBranch: boolean | null;
  packageManager: string;
}

/** Options for creating a new project */
export interface CreateOptions {
  projectName: string;
  targetFolder: string;
  newBranchName?: string | null;
  skipInstall: boolean;
  skipGit: boolean;
  skipClean: boolean;
  skipGenerate: boolean;
  packageManager: string;
  templateUrl?: string;
}

/** Options for adding a remote to the repository */
export interface AddRemoteOptions {
  targetFolder: string;
  remoteUrl?: string;
  remoteName?: string;
  /** If true, don't throw on failure */
  silent?: boolean;
}
