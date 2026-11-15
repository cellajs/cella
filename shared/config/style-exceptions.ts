import type { StyleExceptions } from '@cellajs/cli/style';

/**
 * App-owned exceptions for `pnpm cella style`, joined to the template's. `exempt` lists by rule id the repo-relative files
 * and folders that rule skips, such as a full lucide icon name list (`shared/json/lucide-icon-names.json`) under
 * `source-control-term`. `markerClasses` lists class names the app keeps as hooks with no Tailwind utility or stylesheet
 * rule behind them, each with its reason in a comment.
 */
export const styleExceptions: StyleExceptions = { exempt: {}, markerClasses: [] };
