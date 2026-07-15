import type { TreeRow } from '~/modules/common/data-table/tree';
import type { DocPage } from '~/modules/page/content';

/**
 * Maximum nesting depth (levels); valid `_depth` indices are `0 .. MAX_PAGE_DEPTH - 1`. Used by
 * the expand toggle's "deepest" visual.
 */
export const MAX_PAGE_DEPTH = 3;

/**
 * Pixel height of a pages data-grid row. Shared by the grid `rowHeight` prop and the expand-toggle
 * column's SVG connector layout (which needs row-relative pixel coordinates).
 */
export const PAGES_ROW_HEIGHT = 60;

/** A page row augmented with tree metadata. Produced by `useTreeRows.buildRows`. */
export type PageTreeRow = TreeRow<DocPage>;
