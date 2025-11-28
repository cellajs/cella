// Import all types
import type {
  AppConfig,
  MinimalRepoConfig,
  MinimalLogConfig,
  MinimalBehaviorConfig,
  MinimalSwizzleConfig,
} from "./types";

// Import default configurations
import { forkDefaultConfig } from "./fork.default";
import { boilerplateDefaultConfig } from "./boilerplate.default";
import { logDefaultConfig, logDivergedConfig } from "./log.default";
import { behaviorDefaultConfig } from "./behavior.default";
import { swizzleDefaultConfig } from "./swizzle.default";

// Import custom config
import { cellaConfig as customConfig } from "../../../../cella.config"
import { SYNC_SERVICES, SERVICES_RUNNING_FROM_LOCAL_FORK } from "./sync-services";

/**
 * Import all custom configurations from cella.config.ts
 * Deconstruct then per config section and provide empty object defaults
 */
const {
  fork: customForkConfig = {},
  boilerplate: customBoilerplateConfig = {},
  log: customLogConfig = {},
  behavior: customBehaviorConfig = {},
  swizzle: customSwizzleConfig = {},
} = customConfig;

/**
 * ---------------------------------------------------------------------------
 * SECTION: CONFIG TYPES
 * 
 * - RepoConfig
 * - LogConfig
 * - BehaviorConfig
 * - SwizzleConfig
 *
 * Defines enhanced configuration types with computed properties
 * We extend the minimal config types to include dynamic properties
 * that are derived from other config values at runtime.
 * ---------------------------------------------------------------------------
 */

/**
 * Repository configuration with computed properties
 */
export type RepoConfig = MinimalRepoConfig & {
  /**
   * Location of the repository: 'local' or 'remote'
   */
  location: 'local' | 'remote',

  /**
   * Type of the repository: 'fork' or 'boilerplate'
   */
  type: 'fork' | 'boilerplate',

  /**
   * Indicates if the repository is remote
   */
  isRemote: boolean,

  /**
   * Full branch reference (e.g., 'refs/heads/development')
   */
  branchRef: string,

  /**
   * Full sync branch reference (e.g., 'refs/heads/sync-branch')
   */
  syncBranchRef: string,

  /**
   * Repository reference, either local path or remote URL
   */
  repoReference: string,

  /**
   * Working directory for the repository
   */
  workingDirectory: string,
};

/**
 * Swizzle configuration with computed properties
 */
export type SwizzleConfig = MinimalSwizzleConfig & {
  /**
   * Full local file system path to the swizzle metadata file
   */
  localMetadataFilePath: string;
}

/**
 * Other exported config types (no computed properties needed)
 * In future, we can extend these as needed.
 */
export type LogConfig = MinimalLogConfig;
export type BehaviorConfig = MinimalBehaviorConfig;

/**
 * ---------------------------------------------------------------------------
 * SECTION: CONFIG CLASS
 *
 * Configuration management class for the Cella Sync Engine.
 * Provides methods to get and set configuration values,
 * including computed properties based on current state.
 * ---------------------------------------------------------------------------
 */
export class Config {
  /**
   * Internal state holding the configuration values
   */
  private state: AppConfig;

  constructor(initial: Partial<AppConfig> = {}) {
    this.state = {
      // Static defaults
      syncService: SYNC_SERVICES.BOILERPLATE_FORK,
      forkLocation: 'local',
      boilerplateLocation: 'remote',

      // Defaults merged with customs
      fork: { ...forkDefaultConfig, ...customForkConfig },
      boilerplate: { ...boilerplateDefaultConfig, ...customBoilerplateConfig },
      log: { ...logDefaultConfig, ...customLogConfig },
      behavior: { ...behaviorDefaultConfig, ...customBehaviorConfig },
      swizzle: { ...swizzleDefaultConfig, ...customSwizzleConfig },

      // Global overrides
      ...initial
    };
  }

  /**
   * Getter and setter for the fork repository configuration with computed properties.
   * - Get: the full RepoConfig with dynamic properties
   * - Set: partial updates to the fork configuration
   */
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

  set fork(value: Partial<RepoConfig>) {
    this.state.fork = { ...this.state.fork, ...value };
  }

  /**
   * Getter and setter for the boilerplate repository configuration with computed properties.
   * - Get: the full RepoConfig with dynamic properties
   * - Set: partial updates to the boilerplate configuration
   */
  get boilerplate(): RepoConfig {
    return {
      ...this.state.boilerplate,

      location: this.state.boilerplateLocation,
      type: 'boilerplate',
      isRemote: this.boilerplateIsRemote,
      branchRef: this.boilerplateBranchRef,
      syncBranchRef: this.boilerplateSyncBranchRef,
      repoReference: this.state.boilerplateLocation === 'local' ? this.state.boilerplate.localPath : this.state.boilerplate.remoteUrl,
      workingDirectory: this.workingDirectory
    };
  }
  set boilerplate(value: Partial<RepoConfig>) {
    this.state.boilerplate = { ...this.state.boilerplate, ...value };
  }

  /**
   * Getter for the log configuration
   */
  get log(): LogConfig {
    return this.state.log;
  }

  /**
   * Getter for the behavior configuration
   */
  get behavior(): BehaviorConfig {
    return this.state.behavior;
  }

  /**
   * Getter for the swizzle configuration with computed properties
   */
  get swizzle(): SwizzleConfig {
    return {
      ...this.state.swizzle,
      localMetadataFilePath: this.swizzleLocalMetadataFilePath,
    };
  }

  /**
   * Getter and setter for syncService with side effects
   */
  get syncService(): AppConfig['syncService'] {
    return this.state.syncService;
  }

  /**
   * Setter for syncService with side effects
   * - Adjusts fork and boilerplate locations based on service type
   * - Updates log configuration for specific services
   */
  set syncService(value: AppConfig['syncService']) {
    if (SERVICES_RUNNING_FROM_LOCAL_FORK.includes(value)) {
      // Ensure fork is local if the service requires it
      this.state.forkLocation = 'local';
      this.state.boilerplateLocation = 'remote';
    }

    if (value === SYNC_SERVICES.BOILERPLATE_FORK) {
      this.state.log = logDefaultConfig;
    }

    if (value === SYNC_SERVICES.DIVERGED) {
      this.state.log = logDivergedConfig;
    }

    this.state.syncService = value;
  }

  /**
   * Setter for forkLocation with validation
   */
  set forkLocation(value: 'local' | 'remote') {
    if (SERVICES_RUNNING_FROM_LOCAL_FORK.includes(this.state.syncService) && value === 'remote') {
      throw new Error(`The sync service "${this.state.syncService}" requires a local fork repository.`);
    }

    this.state.forkLocation = value;
  }

  /**
   * Setter for boilerplateLocation
   */
  set boilerplateLocation(value: 'local' | 'remote') {
    this.state.boilerplateLocation = value;
  }

  /**
   * Computed boolean properties
   * - forkIsRemote
   * - boilerplateIsRemote
   */
  get forkIsRemote(): boolean {
    return this.state.forkLocation === 'remote';
  }

  get boilerplateIsRemote(): boolean {
    return this.state.boilerplateLocation === 'remote';
  }

  /**
   * Computed reference properties
   * Those differ depending on whether the repo is local or remote
   * 
   * - forkRepoReference
   * - boilerplateRepoReference
   * - forkBranchRef
   * - forkSyncBranchRef
   * - boilerplateBranchRef
   * - boilerplateSyncBranchRef
   */
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

  /**
   * Computed swizzle metadata file path
   */
  get swizzleLocalMetadataFilePath() {
    return `${this.state.swizzle.localDir}/${this.state.swizzle.metadataFileName}`;
  }

  /**
   * Determines the working directory dynamically 
   */
  get workingDirectory(): string {
    if (SERVICES_RUNNING_FROM_LOCAL_FORK.includes(this.state.syncService)) {
      return this.state.fork.localPath;
    } else {
      return process.cwd();
    }
  }

  /** 
   * Sets a configuration value by key
   * @param key Configuration key to set
   * @param value Value to assign to the key
   * @return void
   */
  set<K extends keyof AppConfig>(key: K, value: AppConfig[K]) {
    this.state[key] = value;
  }

  /**
   * Returns a snapshot (copy) of the current config
   * @return AppConfig
   */
  toJSON(): AppConfig {
    return structuredClone(this.state);
  }
}

export const config = new Config();