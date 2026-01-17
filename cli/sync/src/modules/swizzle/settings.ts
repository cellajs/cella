import { config } from '../../config';
import { SwizzleAnalysis } from '../../types';
import { matchPathPattern } from '../../utils/files';

/**
 * Gets the override status for a specific file path.
 *
 * @param filePath - The file path to check.
 *
 * @returns The override status if found, otherwise undefined.
 */
export function getFlaggedAs(filePath: string): SwizzleAnalysis['flaggedInSettingsAs'] {
  if (config.overrides.ignored?.length) {
    if (config.overrides.ignored.some((pattern) => matchPathPattern(filePath, pattern))) {
      return 'ignored';
    }
  }

  if (config.overrides.customized?.length) {
    if (config.overrides.customized.some((pattern) => matchPathPattern(filePath, pattern))) {
      return 'customized';
    }
  }

  return undefined;
}
