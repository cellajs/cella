import { MinimalBehaviorConfig } from './types';

/**
 * Configuration for specifying behavior during sync operations
 */
export const behaviorDefaultConfig: MinimalBehaviorConfig = {
  /**
   * Behavior when remote is pointing to a different URL than expected.
   */
  onRemoteWrongUrl: 'overwrite',

  /**
   * Behavior when the remote is missing.
   */
  onMissingRemote: 'skip',

  /**
   * Do not write package.json changes, only show them.
   */
  packageJsonMode: 'applyChanges',

  /**
   * Do not write any swizzle metadata file
   */
  skipWritingSwizzleMetadataFile: true,

  /**
   * Maximum number of git previews for squash commits.
   */
  maxGitPreviewsForSquashCommits: 30,
};
