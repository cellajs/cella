import { resolve } from 'node:path';
import { MinimalRepoConfig } from './types';

/** Resolve to monorepo root (cli/sync is 2 levels deep) */
const monorepoRoot = resolve(import.meta.dirname, '../../../..');

/**
 * Default configuration for the fork repository.
 * The fork repository contains the user's fork of the upstream repository.
 */
export const forkDefaultConfig: MinimalRepoConfig = {
  /**
   * Local file system path to the fork repository.
   */
  localPath: monorepoRoot,

  /**
   * The remote URL of the fork repository
   */
  remoteUrl: '',

  /**
   * Your fork's main branch where final changes land.
   */
  branch: 'development',

  /**
   * Intermediate branch for sync operations (local-only, not pushed to remote).
   * Upstream changes are first merged here, conflicts resolved, then squash-merged
   * into your main branch. This keeps your main branch history clean.
   */
  syncBranch: 'sync-branch',

  /**
   * The name to use when adding the fork repository as a remote.
   */
  remoteName: '',
};
