import { config } from '#/config';
import { OverrideStatus } from '#/types';
import { matchPathPattern } from '#/utils/files';

/**
 * Gets the override status for a specific file path from config arrays.
 * Checks config.overrides.ignored and config.overrides.pinned.
 *
 * @param filePath - The file path to check.
 * @returns 'ignored', 'pinned', or undefined.
 */
export function getOverrideStatus(filePath: string): OverrideStatus {
  if (config.overrides.ignored?.length) {
    if (config.overrides.ignored.some((pattern) => matchPathPattern(filePath, pattern))) {
      return 'ignored';
    }
  }

  if (config.overrides.pinned?.length) {
    if (config.overrides.pinned.some((pattern) => matchPathPattern(filePath, pattern))) {
      return 'pinned';
    }
  }

  return undefined;
}
