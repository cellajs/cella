// Define CLI configuration
export interface CLIConfig {
  args: string[];
  packageManager: string;
  syncService: string;
  upstreamLocation: string;
  upstreamBranch: string;
  upstreamRemoteName: string;
  forkLocation: string;
  forkBranch: string;
  forkSyncBranch: string;
  /** When true, skip interactive prompts and use defaults/CLI flags */
  ci: boolean;
  /** When true, show verbose debug output */
  debug: boolean;
  /** When true, skip package.json sync during sync service */
  skipPackages: boolean;
}
