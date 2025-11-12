import { MinimalLogConfig } from "./types";

/**
 * Configuration for logging within the Cella Sync Engine.
 */
export const logDefaultConfig: MinimalLogConfig = {
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

/**
 * Configuration for logging diverged sync service within the Cella Sync Engine.
 */
export const logDivergedConfig: MinimalLogConfig = {
  /**
   * Modules to be logged.
   */
  modules: ['analyzedFile', 'analyzedSummary'],

  /**
   * Filters for logging analyzed files.
   */
  analyzedFile: {
    commitSummaryState: ["diverged"]
  },

  /**
   * Filters for logging analyzed swizzles.
   */
  analyzedSwizzle: {
  }
}; 