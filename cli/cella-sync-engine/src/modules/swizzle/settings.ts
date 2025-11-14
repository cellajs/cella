import { SwizzleAnalysis } from '../../types';
import { config } from '../../config';
import { matchPathPattern } from '../../utils/files';

/**
 * Gets the swizzle status for a specific file path.
 * @param filePath The file path to check.
 * @returns The swizzle status if found, otherwise undefined.
 */
export function getFlaggedAs(filePath: string): SwizzleAnalysis["flaggedInSettingsAs"] {
  if (config.swizzle.removedFiles?.length) {
    if (config.swizzle.removedFiles.some(pattern => matchPathPattern(filePath, pattern))) {
      return 'removed';
    }
  }

  if (config.swizzle.editedFiles?.length) {
    if (config.swizzle.editedFiles.some(pattern => matchPathPattern(filePath, pattern))) {
      return 'edited';
    }
  }

  return undefined;
}