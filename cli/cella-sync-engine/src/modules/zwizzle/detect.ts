import { FileAnalysis, ZwizzleEntry } from '../../types';
import { detectRemovedZwizzle } from './detect-removed';

export function detectZwizzles(analyzedFile: FileAnalysis): ZwizzleEntry | null {
  const zwizzled = detectRemovedZwizzle(analyzedFile);

  return zwizzled || null;
}