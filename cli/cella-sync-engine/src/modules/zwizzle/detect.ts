import { FileAnalysis } from '../../types';
import { detectRemoved } from './detect-removed';

export function detectZwizzles(analyzedFile: FileAnalysis) {
  const zwizzled = detectRemoved(analyzedFile);
  if (zwizzled) {
    console.log('Zwizzles detected:', zwizzled);
  }
}