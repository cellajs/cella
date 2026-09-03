import type { VocabularyAllowlist } from '../scripts/check-app-vocabulary.ts';

/**
 * App-owned exceptions for `pnpm style`'s terminology check: files and path prefixes that may
 * carry the CLI's source-control term, such as a full lucide icon name list
 * (`json/lucide-icon-names.json`) or generated data. Paths are repo-root relative.
 */
export const vocabularyAllowlist: VocabularyAllowlist = {
  files: [],
  prefixes: [],
};
