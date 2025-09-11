import { FileAnalysis, ZwizzleEntry } from '../../types';
import { detectEditedZwizzle } from './detect-edited';
import { detectRemovedZwizzle } from './detect-removed';

export function detectZwizzles(analyzedFile: FileAnalysis): ZwizzleEntry | null {
  const zwizzled = detectRemovedZwizzle(analyzedFile) || detectEditedZwizzle(analyzedFile);

  return zwizzled || null;
}