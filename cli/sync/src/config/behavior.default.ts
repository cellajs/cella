import { MinimalBehaviorConfig } from './types';

/**
 * Configuration for specifying behavior during sync operations
 * - e.g., how to handle certain edge cases?
 */
export const behaviorDefaultConfig: MinimalBehaviorConfig = {
  /**
   * Description: Behavior when remote is pointing to a different URL than expected.
   */
  onRemoteWrongUrl: 'overwrite',

  /**
   * Description: Behavior when the remote is missing.
   */
  onMissingRemote: 'skip',

  /**
   * Description: Whether to skip all git push operations during sync.
   */
  skipAllPushes: true,

  /**
   * Description: Do not write package.json changes, only show them.
   */
  packageJsonMode: 'applyChanges',

  /**
   * Description: Do not write any swizzle metadata file
   */
  skipWritingSwizzleMetadataFile: true,

  /**
   * Description: Maximum number of git previews for Squash commits.
   */
  maxGitPreviewsForSquashCommits: 30,
};
