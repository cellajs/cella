export { logConfig } from "./log";
export { swizzleConfig } from "./swizzle";
export { behaviorConfig } from "./behavior";

import type { AppConfig, MinimalRepoConfig } from "./types";
import { forkDefaultConfig } from "./fork.default";
import { boilerplateDefaultConfig } from "./boilerplate.default";

export type RepoConfig = MinimalRepoConfig & { use: 'local' | 'remote', type: 'fork' | 'boilerplate', workingDirectory: string };

export class Config {
  private state: AppConfig;

  constructor(initial: Partial<AppConfig> = {}) {
    this.state = {
      fork: forkDefaultConfig,
      boilerplate: boilerplateDefaultConfig,
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
  
  get syncService(): AppConfig['syncService'] {
    return this.state.syncService;
  }

  set syncService(value: AppConfig['syncService']) {
    this.state.syncService = value;
  }

  /**
   * Dynamically computed "use" property for fork
   */
  get forkUse(): 'local' | 'remote' {
    return this.state.syncService === 'boilerplate-fork' ? 'local' : 'remote';
  }

  /**
   * Dynamically computed "use" property for boilerplate
   */
  get boilerplateUse(): 'local' | 'remote' {
    return this.state.syncService === 'boilerplate-fork' ? 'remote' : 'local';
  }

  /**
   * Determines the working directory dynamically 
   */
  get workingDirectory(): string {
    if (this.state.syncService === 'boilerplate-fork') {
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