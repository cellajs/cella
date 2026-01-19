/**
 * Configuration management for the Cella sync CLI.
 * Uses a flat structure for clarity and consistency.
 */
import customConfig from '#root/cella.config';
import {
  forkBranchDefault,
  forkSyncBranchDefault,
  maxSquashPreviewsDefault,
  monorepoRoot,
  overridesDefaultConfig,
  packageJsonSyncDefault,
  upstreamBranchDefault,
  upstreamRemoteNameDefault,
  upstreamUrlDefault,
  verboseDefault,
} from './defaults';
import { SERVICES_RUNNING_FROM_LOCAL_FORK, SYNC_SERVICES, type SyncService } from './sync-services';
import type { OverridesConfig, PackageJsonSyncKey, RepoConfig, SyncState } from './types';

/** Internal state holding the configuration values */
const state: SyncState = {
  syncService: SYNC_SERVICES.SYNC,
  debug: false,
  verbose: customConfig.verbose ?? verboseDefault,
  skipPackages: false,
  logFile: false,
  maxSquashPreviews: customConfig.maxSquashPreviews ?? maxSquashPreviewsDefault,
  packageJsonSync: customConfig.packageJsonSync ?? packageJsonSyncDefault,
  pulledCommitCount: 0,

  // Fork settings
  forkLocalPath: monorepoRoot,
  forkBranch: customConfig.forkBranch ?? forkBranchDefault,
  forkSyncBranch: customConfig.forkSyncBranch ?? forkSyncBranchDefault,
  forkLocation: 'local',

  // Upstream settings
  upstreamUrl: customConfig.upstreamUrl ?? upstreamUrlDefault,
  upstreamBranch: customConfig.upstreamBranch ?? upstreamBranchDefault,
  upstreamRemoteName: customConfig.upstreamRemoteName ?? upstreamRemoteNameDefault,
  upstreamLocation: 'remote',

  overrides: { ...overridesDefaultConfig, ...customConfig.overrides },
};

// ─────────────────────────────────────────────────────────────────────────────
// Computed Properties
// ─────────────────────────────────────────────────────────────────────────────

/** Computed branch reference for fork */
const computeForkBranchRef = (): string =>
  state.forkLocation === 'local' ? state.forkBranch : `origin/${state.forkBranch}`;

/** Computed sync branch reference for fork */
const computeForkSyncBranchRef = (): string =>
  state.forkLocation === 'local' ? state.forkSyncBranch : `origin/${state.forkSyncBranch}`;

/** Computed branch reference for upstream */
const computeUpstreamBranchRef = (): string =>
  state.upstreamLocation === 'local' ? state.upstreamBranch : `${state.upstreamRemoteName}/${state.upstreamBranch}`;

/** Determines the working directory dynamically based on sync service */
const computeWorkingDirectory = (): string =>
  SERVICES_RUNNING_FROM_LOCAL_FORK.includes(state.syncService) ? state.forkLocalPath : process.cwd();

// ─────────────────────────────────────────────────────────────────────────────
// RepoConfig Builders (for functions that need full RepoConfig objects)
// ─────────────────────────────────────────────────────────────────────────────

/** Build full fork RepoConfig with computed properties */
export const getFork = (): RepoConfig => ({
  localPath: state.forkLocalPath,
  remoteUrl: '',
  branch: state.forkBranch,
  remoteName: '',
  syncBranch: state.forkSyncBranch,
  location: state.forkLocation,
  type: 'fork',
  isRemote: state.forkLocation === 'remote',
  branchRef: computeForkBranchRef(),
  syncBranchRef: computeForkSyncBranchRef(),
  repoReference: state.forkLocalPath,
  workingDirectory: computeWorkingDirectory(),
});

/** Build full upstream RepoConfig with computed properties */
export const getUpstream = (): RepoConfig => ({
  localPath: '',
  remoteUrl: state.upstreamUrl,
  branch: state.upstreamBranch,
  remoteName: state.upstreamRemoteName,
  syncBranch: '',
  location: state.upstreamLocation,
  type: 'upstream',
  isRemote: state.upstreamLocation === 'remote',
  branchRef: computeUpstreamBranchRef(),
  syncBranchRef: '',
  repoReference: state.upstreamUrl,
  workingDirectory: computeWorkingDirectory(),
});

// ─────────────────────────────────────────────────────────────────────────────
// Config Object
// ─────────────────────────────────────────────────────────────────────────────

/** Sync configuration object with flat properties and computed values */
export const config = {
  // ─── Service & Flags ───────────────────────────────────────────────────────
  get syncService(): SyncService {
    return state.syncService;
  },
  set syncService(value: SyncService) {
    if (SERVICES_RUNNING_FROM_LOCAL_FORK.includes(value)) {
      state.forkLocation = 'local';
      state.upstreamLocation = 'remote';
    }
    state.syncService = value;
  },

  get debug(): boolean {
    return state.debug;
  },
  set debug(value: boolean) {
    state.debug = value;
  },

  get verbose(): boolean {
    return state.verbose;
  },
  set verbose(value: boolean) {
    state.verbose = value;
  },

  /** Returns true if either --verbose or --debug flag is set */
  get isVerbose(): boolean {
    return state.verbose || state.debug;
  },

  get skipPackages(): boolean {
    return state.skipPackages;
  },
  set skipPackages(value: boolean) {
    state.skipPackages = value;
  },

  get logFile(): boolean {
    return state.logFile;
  },
  set logFile(value: boolean) {
    state.logFile = value;
  },

  get maxSquashPreviews(): number {
    return state.maxSquashPreviews;
  },

  /** Number of commits pulled from upstream in this sync session */
  get pulledCommitCount(): number {
    return state.pulledCommitCount;
  },
  set pulledCommitCount(value: number) {
    state.pulledCommitCount = value;
  },

  get packageJsonSync(): PackageJsonSyncKey[] {
    return state.packageJsonSync;
  },

  // ─── Fork Properties ───────────────────────────────────────────────────────
  get forkLocalPath(): string {
    return state.forkLocalPath;
  },

  get forkBranch(): string {
    return state.forkBranch;
  },
  set forkBranch(value: string) {
    state.forkBranch = value;
  },

  get forkSyncBranch(): string {
    return state.forkSyncBranch;
  },
  set forkSyncBranch(value: string) {
    state.forkSyncBranch = value;
  },

  /** Computed: branch ref (e.g., 'development' or 'origin/development') */
  get forkBranchRef(): string {
    return computeForkBranchRef();
  },

  /** Computed: sync branch ref */
  get forkSyncBranchRef(): string {
    return computeForkSyncBranchRef();
  },

  // ─── Upstream Properties ───────────────────────────────────────────────────
  get upstreamUrl(): string {
    return state.upstreamUrl;
  },
  set upstreamUrl(value: string) {
    state.upstreamUrl = value;
  },

  get upstreamBranch(): string {
    return state.upstreamBranch;
  },
  set upstreamBranch(value: string) {
    state.upstreamBranch = value;
  },

  get upstreamRemoteName(): string {
    return state.upstreamRemoteName;
  },
  set upstreamRemoteName(value: string) {
    state.upstreamRemoteName = value;
  },

  /** Computed: branch ref (e.g., 'cella-upstream/development') */
  get upstreamBranchRef(): string {
    return computeUpstreamBranchRef();
  },

  // ─── Computed Properties ───────────────────────────────────────────────────
  get workingDirectory(): string {
    return computeWorkingDirectory();
  },

  get overrides(): OverridesConfig {
    return state.overrides;
  },

  // ─── RepoConfig Accessors (for generic functions) ──────────────────────────
  /** Get full RepoConfig for fork (for functions that need the full object) */
  get fork(): RepoConfig {
    return getFork();
  },

  /** Get full RepoConfig for upstream (for functions that need the full object) */
  get upstream(): RepoConfig {
    return getUpstream();
  },

  /** Returns a snapshot (copy) of the current state */
  toJSON(): SyncState {
    return structuredClone(state);
  },
};

export type { RepoConfig } from './types';
