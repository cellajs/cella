/** CLI options parsed from command line arguments */
export interface CLIOptions {
  template?: string;
  portOffset?: number;
  adminEmail?: string;
  skipInstall?: boolean;
}

/** CLI configuration state */
export interface CLIConfig {
  options: CLIOptions;
  args: string[];
  directory: string | null;
  newBranchName: string | null;
  packageManager: string;
}

/** Options for creating a new project */
export interface CreateOptions {
  projectName: string;
  targetFolder: string;
  newBranchName?: string | null;
  packageManager: string;
  templateUrl?: string;
  /** Giget ref (release tag or commit SHA) to download the template at. Ignored for local templates. */
  templateRef?: string;
  /** Port offset to avoid collisions with sibling forks (0 = default ports) */
  portOffset: number;
  /** Admin email for initial seed user (defaults to admin@{slug}.example.com) */
  adminEmail?: string;
  /** Skip dependency installation and migration generation (scaffold only) */
  skipInstall?: boolean;
  /** Suppress all output (for testing) */
  silent?: boolean;
}

/** Options for adding a remote to the repository */
export interface AddRemoteOptions {
  targetFolder: string;
  remoteUrl?: string;
  remoteName?: string;
  /** If true, don't throw on failure */
  silent?: boolean;
}
