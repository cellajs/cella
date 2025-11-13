export { swizzleConfig } from "./swizzle";

import type { AppConfig, MinimalRepoConfig, MinimalLogConfig, MinimalBehaviorConfig } from "./types";
import { forkDefaultConfig } from "./fork.default";
import { boilerplateDefaultConfig } from "./boilerplate.default";
import { logDefaultConfig, logDivergedConfig } from "./log.default";
import { behaviorDefaultConfig } from "./behavior.default";

export type RepoConfig = MinimalRepoConfig & { 
  location: 'local' | 'remote', 
  type: 'fork' | 'boilerplate', 
  isRemote: boolean,
  branchRef: string,
  syncBranchRef: string,
  repoReference: string,
  workingDirectory: string,
};

export class Config {
  private state: AppConfig;

  constructor(initial: Partial<AppConfig> = {}) {
    this.state = {
      syncService: 'boilerplate-fork',

      fork: forkDefaultConfig,
      forkLocation: 'local',

      boilerplate: boilerplateDefaultConfig,
      boilerplateLocation: 'remote',

      log: logDefaultConfig,
      behavior: behaviorDefaultConfig,
      
      ...initial
    };
  }

  get fork(): RepoConfig {
    return {
      ...this.state.fork,
      location: this.state.forkLocation,
      type: 'fork',
      isRemote: this.forkIsRemote,
      branchRef: this.forkBranchRef,
      syncBranchRef: this.forkSyncBranchRef,
      repoReference: this.state.forkLocation === 'local' ? this.state.fork.localPath : this.state.fork.remoteUrl,
      workingDirectory: this.workingDirectory
    };
  }

  get boilerplate(): RepoConfig {
    return {
      ...this.state.boilerplate,
      location: this.state.boilerplateLocation,
      type: 'boilerplate',
      isRemote: this.boilerplateIsRemote,
      branchRef: this.boilerplateBranchRef,
      syncBranchRef: this.boilerplateSyncBranchRef,
      repoReference:  this.state.boilerplateLocation === 'local' ? this.state.boilerplate.localPath : this.state.boilerplate.remoteUrl,
      workingDirectory: this.workingDirectory
    };
  }

  set boilerplate(value: Partial<RepoConfig>) {
    this.state.boilerplate = { ...this.state.boilerplate, ...value };
  }

  get log(): MinimalLogConfig {
    return this.state.log;
  }

  get behavior(): MinimalBehaviorConfig {
    return this.state.behavior;
  }

  get syncService(): AppConfig['syncService'] {
    return this.state.syncService;
  }

  get forkIsRemote(): boolean {
    if (['boilerplate-fork', 'diverged', 'boilerplate-fork+packages', 'packages'].includes(this.state.syncService)) {
      return false;
    }

    return this.state.forkLocation === 'remote';
  }

  get boilerplateIsRemote(): boolean {
    if (['boilerplate-fork', 'diverged', 'boilerplate-fork+packages', 'packages'].includes(this.state.syncService)) {
      return true;
    }
    return this.state.boilerplateLocation === 'remote';
  }

  get forkRepoReference(): string {
    if (this.forkIsRemote) return this.state.fork.remoteUrl;
    return this.state.fork.localPath;
  }

  get boilerplateRepoReference(): string {
    if (this.boilerplateIsRemote) return this.state.boilerplate.remoteUrl;
    return this.state.boilerplate.localPath;
  }

  get forkBranchRef(): string {
    if (!this.forkIsRemote) return this.state.fork.branch;
    return `${this.state.fork.remoteName}/${this.state.fork.branch}`;
  }

  get forkSyncBranchRef(): string {
    if (!this.forkIsRemote) return this.state.fork.syncBranch;
    return `${this.state.fork.remoteName}/${this.state.fork.syncBranch}`;
  }

  get boilerplateBranchRef(): string {
    if (!this.boilerplateIsRemote) return this.state.boilerplate.branch;
    return `${this.state.boilerplate.remoteName}/${this.state.boilerplate.branch}`;
  }

  get boilerplateSyncBranchRef(): string {
    if (!this.boilerplateIsRemote) return this.state.boilerplate.syncBranch;
    return `${this.state.boilerplate.remoteName}/${this.state.boilerplate.syncBranch}`;
  }

  set syncService(value: AppConfig['syncService']) {
    if (['boilerplate-fork', 'boilerplate-fork+packages', 'packages', 'diverged'].includes(value)) {
      this.state.forkLocation = 'local';
      this.state.boilerplateLocation = 'remote';
    }

    if (value === 'boilerplate-fork') {
      this.state.log = logDefaultConfig;
    }

    if (value === 'diverged') {
      this.state.log = logDivergedConfig;
    }

    this.state.syncService = value;
  }

  set forkLocation(value: 'local' | 'remote') {
    this.state.forkLocation = value;
  }

  set boilerplateLocation(value: 'local' | 'remote') {
    this.state.boilerplateLocation = value;
  }

  /**
   * Determines the working directory dynamically 
   */
  get workingDirectory(): string {
    if (['boilerplate-fork', 'diverged', 'packages', 'boilerplate-fork+packages'].includes(this.state.syncService)) {
      return this.state.fork.localPath;
    } else {
      return "";
    }
  }

  /** You can set nested values dynamically if needed */
  set<K extends keyof AppConfig>(key: K, value: AppConfig[K]) {
    this.state[key] = value;
  }

  /** Returns a snapshot (copy) of the current config */
  toJSON(): AppConfig {
    return structuredClone(this.state);
  }
}

export const config = new Config();