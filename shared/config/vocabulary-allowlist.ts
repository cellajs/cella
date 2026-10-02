import type { VocabularyAllowlist } from '../scripts/check-app-vocabulary.ts';

/**
 * App-owned exceptions for `pnpm style`: files and path prefixes that may carry the CLI's source-control term, such as
 * a full lucide icon name list (`json/lucide-icon-names.json`) or generated data, and in `proseExclude` the path
 * prefixes the comment and doc checks skip. Paths are repo-root relative. `markerClasses` lists class names the app
 * keeps as hooks with no Tailwind utility or stylesheet rule behind them, each with its reason.
 */
export const vocabularyAllowlist: VocabularyAllowlist = { files: [], prefixes: [], proseExclude: [], markerClasses: {} };
