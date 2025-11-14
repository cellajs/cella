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
}