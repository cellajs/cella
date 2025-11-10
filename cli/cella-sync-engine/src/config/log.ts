import { Log } from "../types/config";

/**
 * Configuration for logging within the Cella Sync Engine.
 */
export const logConfig: Log = {
  /**
   * Modules to be logged.
   */
  modules: ['analyzedFile', 'analyzedSummary'],

  /**
   * Filters for logging analyzed files.
   */
  analyzedFile: {
    mergeStrategyStrategy: ["unknown"]
  },

  /**
   * Filters for logging analyzed swizzles.
   */
  analyzedSwizzle: {
    swizzled: true,
  }
};
