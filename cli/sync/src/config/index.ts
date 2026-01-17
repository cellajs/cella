// Import custom config from user's cella.config.ts
import customConfig from '../../../../cella.config';
// Import default configurations
import {
  behaviorDefaultConfig,
  forkDefaultConfig,
  logDefaultConfig,
  overridesDefaultConfig,
  upstreamDefaultConfig,
} from './defaults';
import type { SyncService } from './sync-services';
import { SERVICES_RUNNING_FROM_LOCAL_FORK, SYNC_SERVICES } from './sync-services';
import type { RepoConfig, SyncState } from './types';

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
 * Uses shared types from config/types.
 * ---------------------------------------------------------------------------
 */

/**
 * ---------------------------------------------------------------------------
 * SECTION: CONFIG CLASS
 *
 * Configuration management class for the Cella sync CLI.
 * Provides methods to get and set configuration values,
 * including computed properties based on current state.
 * ---------------------------------------------------------------------------
 */
class Config {
  /**
   * Internal state holding the configuration values
   */
  private state: SyncState;

  constructor(initial: Partial<SyncState> = {}) {
    this.state = {
      // Static defaults
      syncService: SYNC_SERVICES.SYNC,
      debug: false,
      skipPackages: false,
      forkLocation: 'local',
      upstreamLocation: 'remote',

      // Defaults merged with customs
      fork: { ...forkDefaultConfig, ...customForkConfig },
      upstream: { ...upstreamDefaultConfig, ...customUpstreamConfig },
      log: { ...logDefaultConfig, ...customLogConfig },
      behavior: { ...behaviorDefaultConfig, ...customBehaviorConfig },
      overrides: { ...overridesDefaultConfig, ...customOverridesConfig },

      // Global overrides
      ...initial,
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
      workingDirectory: this.workingDirectory,
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
      repoReference:
        this.state.upstreamLocation === 'local' ? this.state.upstream.localPath : this.state.upstream.remoteUrl,
      workingDirectory: this.workingDirectory,
    };
  }
  set upstream(value: Partial<RepoConfig>) {
    this.state.upstream = { ...this.state.upstream, ...value };
  }

  /**
   * Getter for the log configuration
   */
  get log() {
    return this.state.log;
  }

  /**
   * Getter for the behavior configuration
   */
  get behavior() {
    return this.state.behavior;
  }

  /**
   * Getter for the overrides configuration
   */
  get overrides() {
    return this.state.overrides;
  }

  /**
   * Getter and setter for syncService with side effects
   */
  get syncService(): SyncService {
    return this.state.syncService;
  }

  /**
   * Getter and setter for debug mode
   */
  get debug(): boolean {
    return this.state.debug;
  }

  set debug(value: boolean) {
    this.state.debug = value;
  }

  /**
   * Setter for syncService with side effects
   * - Adjusts fork and upstream locations based on service type
   * - Updates log configuration for specific services
   */
  set syncService(value: SyncService) {
    if (SERVICES_RUNNING_FROM_LOCAL_FORK.includes(value)) {
      // Ensure fork is local if the service requires it
      this.state.forkLocation = 'local';
      this.state.upstreamLocation = 'remote';
    }

    if (value === SYNC_SERVICES.SYNC || value === SYNC_SERVICES.ANALYZE) {
      this.state.log = logDefaultConfig;
    }

    this.state.syncService = value;
  }

  /**
   * Getter and setter for skipPackages
   */
  get skipPackages(): boolean {
    return this.state.skipPackages;
  }

  set skipPackages(value: boolean) {
    this.state.skipPackages = value;
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
  set<K extends keyof SyncState>(key: K, value: SyncState[K]) {
    this.state[key] = value;
  }

  /**
   * Returns a snapshot (copy) of the current config
   * @return SyncState
   */
  toJSON(): SyncState {
    return structuredClone(this.state);
  }
}

export const config = new Config();

// Re-export commonly used types for consumers of config
export type { RepoConfig } from './types';
