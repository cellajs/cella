export interface MinimalRepoConfig {
  localPath: string;
  remoteUrl: string;
  branch: string;
  remoteName: string;
  syncBranch: string;
}

export interface AppConfig {
  syncService: 'boilerplate-fork' | 'boilerplate-fork+packages' | 'packages' | 'diverged';
  fork: MinimalRepoConfig;
  boilerplate: MinimalRepoConfig;
}