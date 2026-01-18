/**
 * Configuration management for the Cella sync CLI.
 * Uses a simple object + functions pattern instead of a class.
 */
import customConfig from '../../../../cella.config';
import {
  behaviorDefaultConfig,
  forkDefaultConfig,
  logDefaultConfig,
  overridesDefaultConfig,
  upstreamDefaultConfig,
} from './defaults';
import { SERVICES_RUNNING_FROM_LOCAL_FORK, type SyncService, SYNC_SERVICES } from './sync-services';
import type { BaseRepoConfig, BehaviorConfig, LogConfig, OverridesConfig, RepoConfig, SyncState } from './types';

// Deconstruct custom configs with empty object defaults
const {
  fork: customForkConfig = {},
  upstream: customUpstreamConfig = {},
  log: customLogConfig = {},
  behavior: customBehaviorConfig = {},
  overrides: customOverridesConfig = {},
} = customConfig;

/** Internal state holding the configuration values */
const state: SyncState = {
  syncService: SYNC_SERVICES.SYNC,
  debug: false,
  skipPackages: false,
  forkLocation: 'local',
  upstreamLocation: 'remote',
  fork: { ...forkDefaultConfig, ...customForkConfig },
  upstream: { ...upstreamDefaultConfig, ...customUpstreamConfig },
  log: { ...logDefaultConfig, ...customLogConfig },
  behavior: { ...behaviorDefaultConfig, ...customBehaviorConfig },
  overrides: { ...overridesDefaultConfig, ...customOverridesConfig },
};

/** Computed branch reference for fork */
const computeForkBranchRef = (): string =>
  state.forkLocation === 'local' ? state.fork.branch : `${state.fork.remoteName}/${state.fork.branch}`;

/** Computed sync branch reference for fork */
const computeForkSyncBranchRef = (): string =>
  state.forkLocation === 'local' ? state.fork.syncBranch : `${state.fork.remoteName}/${state.fork.syncBranch}`;

/** Computed branch reference for upstream */
const computeUpstreamBranchRef = (): string =>
  state.upstreamLocation === 'local' ? state.upstream.branch : `${state.upstream.remoteName}/${state.upstream.branch}`;

/** Computed sync branch reference for upstream */
const computeUpstreamSyncBranchRef = (): string =>
  state.upstreamLocation === 'local'
    ? state.upstream.syncBranch
    : `${state.upstream.remoteName}/${state.upstream.syncBranch}`;

/** Determines the working directory dynamically based on sync service */
const computeWorkingDirectory = (): string =>
  SERVICES_RUNNING_FROM_LOCAL_FORK.includes(state.syncService) ? state.fork.localPath : process.cwd();

/** Full fork RepoConfig with computed properties */
export const getFork = (): RepoConfig => ({
  ...state.fork,
  location: state.forkLocation,
  type: 'fork',
  isRemote: state.forkLocation === 'remote',
  branchRef: computeForkBranchRef(),
  syncBranchRef: computeForkSyncBranchRef(),
  repoReference: state.forkLocation === 'local' ? state.fork.localPath : state.fork.remoteUrl,
  workingDirectory: computeWorkingDirectory(),
});

/** Full upstream RepoConfig with computed properties */
export const getUpstream = (): RepoConfig => ({
  ...state.upstream,
  location: state.upstreamLocation,
  type: 'upstream',
  isRemote: state.upstreamLocation === 'remote',
  branchRef: computeUpstreamBranchRef(),
  syncBranchRef: computeUpstreamSyncBranchRef(),
  repoReference: state.upstreamLocation === 'local' ? state.upstream.localPath : state.upstream.remoteUrl,
  workingDirectory: computeWorkingDirectory(),
});

/** Sync configuration object with getters, setters, and computed properties */
export const config = {
  // Direct state access
  get syncService(): SyncService {
    return state.syncService;
  },
  set syncService(value: SyncService) {
    if (SERVICES_RUNNING_FROM_LOCAL_FORK.includes(value)) {
      state.forkLocation = 'local';
      state.upstreamLocation = 'remote';
    }
    if (value === SYNC_SERVICES.SYNC || value === SYNC_SERVICES.ANALYZE) {
      state.log = logDefaultConfig;
    }
    state.syncService = value;
  },

  get debug(): boolean {
    return state.debug;
  },
  set debug(value: boolean) {
    state.debug = value;
  },

  get skipPackages(): boolean {
    return state.skipPackages;
  },
  set skipPackages(value: boolean) {
    state.skipPackages = value;
  },

  // Computed RepoConfig objects
  get fork(): RepoConfig {
    return getFork();
  },
  set fork(value: Partial<BaseRepoConfig>) {
    Object.assign(state.fork, value);
  },

  get upstream(): RepoConfig {
    return getUpstream();
  },
  set upstream(value: Partial<BaseRepoConfig>) {
    Object.assign(state.upstream, value);
  },

  // Config sections (read-only access, modify via state)
  get log(): LogConfig {
    return state.log;
  },

  get behavior(): BehaviorConfig {
    return state.behavior;
  },

  get overrides(): OverridesConfig {
    return state.overrides;
  },

  // Computed convenience property
  get workingDirectory(): string {
    return computeWorkingDirectory();
  },

  /** Returns a snapshot (copy) of the current state */
  toJSON(): SyncState {
    return structuredClone(state);
  },
};

export type { RepoConfig } from './types';
