import { BehaviorConfig } from "../types/config";

/**
 * Configuration for specifying behavior during sync operations
 * - e.g., how to handle certain edge cases?
 */
export const behaviorConfig: BehaviorConfig = {
  onRemoteWrongUrl: 'overwrite',
}