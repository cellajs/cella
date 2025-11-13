export { swizzleConfig } from "./swizzle";
export { behaviorConfig } from "./behavior";

import type { AppConfig, MinimalRepoConfig, MinimalLogConfig } from "./types";
import { forkDefaultConfig } from "./fork.default";
import { boilerplateDefaultConfig } from "./boilerplate.default";
import { logDefaultConfig, logDivergedConfig } from "./log.default";

export type RepoConfig = MinimalRepoConfig & { use: 'local' | 'remote', type: 'fork' | 'boilerplate', workingDirectory: string };

export class Config {
  private state: AppConfig;

  constructor(initial: Partial<AppConfig> = {}) {
    this.state = {
      syncService: 'boilerplate-fork',

      fork: forkDefaultConfig,
      forkUse: 'local',

      boilerplate: boilerplateDefaultConfig,
      boilerplateUse: 'remote',

      log: logDefaultConfig,
      ...initial
    };
  }

  get fork(): RepoConfig {
    return {
      ...this.state.fork,
      use: this.state.forkUse,
      type: 'fork',
      workingDirectory: this.workingDirectory
    };
  }

  get boilerplate(): RepoConfig {
    return {
      ...this.state.boilerplate,
      use: this.state.boilerplateUse,
      type: 'boilerplate',
      workingDirectory: this.workingDirectory
    };
  }

  get log(): MinimalLogConfig {
    return this.state.log;
  }
  
  get syncService(): AppConfig['syncService'] {
    return this.state.syncService;
  }

  set syncService(value: AppConfig['syncService']) {
    if (value === 'boilerplate-fork') {
      this.state.forkUse = 'local';
      this.state.boilerplateUse = 'remote';
      this.state.log = logDefaultConfig;
    }
    
    if (value === 'diverged') {
      this.state.forkUse = 'local';
      this.state.boilerplateUse = 'remote';
      this.state.log = logDivergedConfig;
    }
    
    this.state.syncService = value;
  }

  set forkUse(value: 'local' | 'remote') {
    this.state.forkUse = value;
  }

  set boilerplateUse(value: 'local' | 'remote') {
    this.state.boilerplateUse = value;
  }

  /**
   * Determines the working directory dynamically 
   */
  get workingDirectory(): string {
    if (['boilerplate-fork', 'diverged'].includes(this.state.syncService)) {
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