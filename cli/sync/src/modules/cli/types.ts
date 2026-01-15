// Define CLI configuration
export interface CLIConfig {
  args: string[];
  packageManager: string;
  syncService: string;
  boilerplateLocation: string;
  boilerplateBranch: string;
  boilerplateRemoteName: string;
  forkLocation: string;
  forkBranch: string;
  forkSyncBranch: string;
  /** When true, skip interactive prompts and use defaults/CLI flags */
  ci: boolean;
}

// Define supported configuration actions (continue or customize)
export type ConfigurationAction = 'continue' | 'customize';

// Define all possible customization options
export type CustomizeOption =
  | 'boilerplateLocation'
  | 'boilerplateBranch'
  | 'boilerplateRemoteName'
  | 'divergedCommitStatus'
  | 'forkLocation'
  | 'forkBranch'
  | 'forkSyncBranch'
  | 'packageJsonMode'
  | 'skipAllPushes'
  | 'maxGitPreviewsForSquashCommits'
  | 'done';