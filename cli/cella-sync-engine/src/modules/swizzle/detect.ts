import { FileAnalysis, SwizzleEntry } from '../../types';
import { detectEditedSwizzle } from './detect-edited';
import { detectRemovedSwizzle } from './detect-removed';

export function detectSwizzles(analyzedFile: FileAnalysis): SwizzleEntry | null {
  const swizzled = detectRemovedSwizzle(analyzedFile) || detectEditedSwizzle(analyzedFile);

  return swizzled || null;
}