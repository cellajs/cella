import { MinimalLogConfig } from './types';

/**
 * Configuration for logging within the Cella Sync Engine.
 * Shows files that need attention: diverged, behind, or unknown merge strategy.
 */
export const logDefaultConfig: MinimalLogConfig = {
  /**
   * Modules to be logged.
   */
  modules: ['analyzedFile', 'analyzedSummary', 'packageSummary'],

  /**
   * Filters for logging analyzed files.
   * Show diverged files and files with unknown merge strategy.
   */
  analyzedFile: {
    commitSummaryState: ['diverged', 'behind'],
    mergeStrategyStrategy: ['unknown'],
  },

  /**
   * Filters for logging analyzed swizzles.
   */
  analyzedSwizzle: {
    swizzled: true,
  },
};
