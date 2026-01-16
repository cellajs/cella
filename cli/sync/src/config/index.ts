// Import all types
import type {
  SyncConfig,
  MinimalRepoConfig,
  MinimalLogConfig,
  MinimalBehaviorConfig,
  MinimalOverridesConfig,
} from "./types";

// Import default configurations
import { forkDefaultConfig } from "./fork.default";
import { upstreamDefaultConfig } from "./upstream.default";
import { logDefaultConfig, logDivergedConfig } from "./log.default";
import { behaviorDefaultConfig } from "./behavior.default";
import { overridesDefaultConfig } from "./overrides.default";

// Import custom config
import { cellaConfig as customConfig } from "../../../../cella.config"
import { SYNC_SERVICES, SERVICES_RUNNING_FROM_LOCAL_FORK } from "./sync-services";

/**
 * Import all custom configurations from cella.config.ts
 * Deconstruct then per config section and provide empty object defaults
 */
const {
  fork: customForkConfig = {},
  upstream: customUpstreamConfig = {},
  log: customLogConfig = {},
  behavior: customBehaviorConfig = {},
  overrides: customOverridesConfig = {},
} = customConfig;

/**
 * ---------------------------------------------------------------------------
 * SECTION: CONFIG TYPES
 * 
 * - RepoConfig
 * - LogConfig
 * - BehaviorConfig
 * - OverridesConfig
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
   * Type of the repository: 'fork' or 'upstream'
   */
  type: 'fork' | 'upstream',

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
 * Overrides configuration with computed properties
 */
export type OverridesConfig = MinimalOverridesConfig & {
  /**
   * Full local file system path to the overrides metadata file
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
  private state: SyncConfig;

  constructor(initial: Partial<SyncConfig> = {}) {
    this.state = {
      // Static defaults
      syncService: SYNC_SERVICES.UPSTREAM_FORK,
      forkLocation: 'local',
      upstreamLocation: 'remote',

      // Defaults merged with customs
      fork: { ...forkDefaultConfig, ...customForkConfig },
      upstream: { ...upstreamDefaultConfig, ...customUpstreamConfig },
      log: { ...logDefaultConfig, ...customLogConfig },
      behavior: { ...behaviorDefaultConfig, ...customBehaviorConfig },
      overrides: { ...overridesDefaultConfig, ...customOverridesConfig },

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
   * Getter and setter for the upstream repository configuration with computed properties.
   * - Get: the full RepoConfig with dynamic properties
   * - Set: partial updates to the upstream configuration
   */
  get upstream(): RepoConfig {
    return {
      ...this.state.upstream,

      location: this.state.upstreamLocation,
      type: 'upstream',
      isRemote: this.upstreamIsRemote,
      branchRef: this.upstreamBranchRef,
      syncBranchRef: this.upstreamSyncBranchRef,
      repoReference: this.state.upstreamLocation === 'local' ? this.state.upstream.localPath : this.state.upstream.remoteUrl,
      workingDirectory: this.workingDirectory
    };
  }
  set upstream(value: Partial<RepoConfig>) {
    this.state.upstream = { ...this.state.upstream, ...value };
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
   * Getter for the overrides configuration with computed properties
   */
  get overrides(): OverridesConfig {
    return {
      ...this.state.overrides,
      localMetadataFilePath: this.overridesLocalMetadataFilePath,
    };
  }

  /**
   * Getter and setter for syncService with side effects
   */
  get syncService(): SyncConfig['syncService'] {
    return this.state.syncService;
  }

  /**
   * Setter for syncService with side effects
   * - Adjusts fork and upstream locations based on service type
   * - Updates log configuration for specific services
   */
  set syncService(value: SyncConfig['syncService']) {
    if (SERVICES_RUNNING_FROM_LOCAL_FORK.includes(value)) {
      // Ensure fork is local if the service requires it
      this.state.forkLocation = 'local';
      this.state.upstreamLocation = 'remote';
    }

    if (value === SYNC_SERVICES.UPSTREAM_FORK) {
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
   * Setter for upstreamLocation
   */
  set upstreamLocation(value: 'local' | 'remote') {
    this.state.upstreamLocation = value;
  }

  /**
   * Computed boolean properties
   * - forkIsRemote
   * - upstreamIsRemote
   */
  get forkIsRemote(): boolean {
    return this.state.forkLocation === 'remote';
  }

  get upstreamIsRemote(): boolean {
    return this.state.upstreamLocation === 'remote';
  }

  /**
   * Computed reference properties
   * Those differ depending on whether the repo is local or remote
   * 
   * - forkRepoReference
   * - upstreamRepoReference
   * - forkBranchRef
   * - forkSyncBranchRef
   * - upstreamBranchRef
   * - upstreamSyncBranchRef
   */
  get forkRepoReference(): string {
    if (this.forkIsRemote) return this.state.fork.remoteUrl;
    return this.state.fork.localPath;
  }

  get upstreamRepoReference(): string {
    if (this.upstreamIsRemote) return this.state.upstream.remoteUrl;
    return this.state.upstream.localPath;
  }

  get forkBranchRef(): string {
    if (!this.forkIsRemote) return this.state.fork.branch;
    return `${this.state.fork.remoteName}/${this.state.fork.branch}`;
  }

  get forkSyncBranchRef(): string {
    if (!this.forkIsRemote) return this.state.fork.syncBranch;
    return `${this.state.fork.remoteName}/${this.state.fork.syncBranch}`;
  }

  get upstreamBranchRef(): string {
    if (!this.upstreamIsRemote) return this.state.upstream.branch;
    return `${this.state.upstream.remoteName}/${this.state.upstream.branch}`;
  }

  get upstreamSyncBranchRef(): string {
    if (!this.upstreamIsRemote) return this.state.upstream.syncBranch;
    return `${this.state.upstream.remoteName}/${this.state.upstream.syncBranch}`;
  }

  /**
   * Computed overrides metadata file path
   */
  get overridesLocalMetadataFilePath() {
    return `${this.state.overrides.localDir}/${this.state.overrides.metadataFileName}`;
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
  set<K extends keyof SyncConfig>(key: K, value: SyncConfig[K]) {
    this.state[key] = value;
  }

  /**
   * Returns a snapshot (copy) of the current config
   * @return SyncConfig
   */
  toJSON(): SyncConfig {
    return structuredClone(this.state);
  }
}

export const config = new Config();