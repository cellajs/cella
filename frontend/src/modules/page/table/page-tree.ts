import type { TreeRow } from '~/modules/common/data-table/tree/build-tree';
import type { DocPage } from '~/modules/page/content';

/** Maximum nesting depth in levels; valid `_depth` indices are `0 .. maxPageDepth - 1`. */
export const maxPageDepth = 3;

/** Pixel height of a pages data-grid row, shared by the grid `rowHeight` prop and the expand-toggle SVG connector layout. */
export const pagesRowHeight = 60;

export type PageTreeRow = TreeRow<DocPage>;
