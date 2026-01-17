import { config } from '../../config';
import { OverrideStatus } from '../../types';
import { matchPathPattern } from '../../utils/files';

/**
 * Gets the override status for a specific file path from config arrays.
 * Checks config.overrides.ignored and config.overrides.customized.
 *
 * @param filePath - The file path to check.
 * @returns 'ignored', 'customized', or undefined.
 */
export function getOverrideStatus(filePath: string): OverrideStatus {
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
