import type { TreeRow } from '~/modules/common/data-table/tree';
import type { DocPage } from '~/modules/page/content';

/** Maximum nesting depth in levels; valid `_depth` indices are `0 .. MAX_PAGE_DEPTH - 1`. */
export const MAX_PAGE_DEPTH = 3;

/** Pixel height of a pages data-grid row, shared by the grid `rowHeight` prop and the expand-toggle SVG connector layout. */
export const PAGES_ROW_HEIGHT = 60;

export type PageTreeRow = TreeRow<DocPage>;
