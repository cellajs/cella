export { logConfig } from "./log";
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
      fork: forkDefaultConfig,
      boilerplate: boilerplateDefaultConfig,
      log: logDefaultConfig,
      syncService: 'boilerplate-fork',
      ...initial
    };
  }

  get fork(): RepoConfig {
    return {
      ...this.state.fork,
      use: this.forkUse,
      type: 'fork',
      workingDirectory: this.workingDirectory
    };
  }

  get boilerplate(): RepoConfig {
    return {
      ...this.state.boilerplate,
      use: this.boilerplateUse,
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
    if (value === 'diverged') {
      this.state.log = logDivergedConfig;
    }
    
    this.state.syncService = value;
  }

  /**
   * Dynamically computed "use" property for fork
   */
  get forkUse(): 'local' | 'remote' {
    return ['boilerplate-fork', 'diverged'].includes(this.state.syncService) ? 'local' : 'remote';
  }

  /**
   * Dynamically computed "use" property for boilerplate
   */
  get boilerplateUse(): 'local' | 'remote' {
    return ['boilerplate-fork', 'diverged'].includes(this.state.syncService) ? 'remote' : 'local';
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