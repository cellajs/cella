/** CLI configuration parsed from command-line arguments */
export interface CLIConfig {
  args: string[];
  packageManager: string;
  syncService: string;
  upstreamBranch: string;
  forkBranch: string;
  forkSyncBranch: string;
  /** When true, skip interactive prompts and use defaults/CLI flags */
  ci: boolean;
  /** When true, show verbose debug output */
  debug: boolean;
  /** When true, show verbose output (less than debug) */
  verbose: boolean;
  /** When true, skip package.json sync during sync service */
  skipPackages: boolean;
  /** When true, write full file analysis to a timestamped log file */
  logFile: boolean;
}
