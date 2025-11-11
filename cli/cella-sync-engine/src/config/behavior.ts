import { BehaviorConfig } from "../types/config";

/**
 * Configuration for specifying behavior during sync operations
 * - e.g., how to handle certain edge cases?
 */
export const behaviorConfig: BehaviorConfig = {
  /**
   * Module: run-preflight
   * Description: Behavior when remote is pointing to a different URL than expected.
   */
  onRemoteWrongUrl: 'overwrite',

  /**
   * Module: run-preflight
   * Description: Behavior when the upstream remote is missing.
   */
  onMissingUpstream: 'skip',

  /**
   * Module: all
   * Description: Whether to skip all git push operations during sync.
   */
  skipAllPushes: true,
}