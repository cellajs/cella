import { FileAnalysis, SwizzleEntry } from '../../types';
import { detectEditedSwizzle } from './detect-edited';
import { detectRemovedSwizzle } from './detect-removed';

/**
 * Detects if a file has been swizzled (edited or removed).
 * 
 * @param analyzedFile - The analyzed file to check for swizzling.
 * @returns A SwizzleEntry if the file is swizzled, otherwise null.
 */
export function detectSwizzles(analyzedFile: FileAnalysis): SwizzleEntry | null {
  const swizzled = detectRemovedSwizzle(analyzedFile) || detectEditedSwizzle(analyzedFile);

  return swizzled || null;
}