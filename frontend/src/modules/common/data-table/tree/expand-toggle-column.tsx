import { RenderExpandToggle } from '~/modules/common/data-grid/cell-renderers';
import type { ColumnOrColumnGroup } from '~/modules/common/data-table/types';
import type { TreeRow } from './build-tree';
import { useTreeContext } from './tree-context';

export const expandToggleColumnKey = 'expand-toggle-column';

/**
 * Minimal row contract this column reads. Any `TreeRow<T>` produced by
 * {@link buildTree} satisfies it.
 */
type AnyTreeRow = TreeRow<{ id: string }>;

/**
 * Inner component so `useTreeContext()` is called inside a real React render
 * (one component per cell instance), not directly in the renderCell callback.
 */
function ExpandToggleCell({ row, tabIndex }: { row: AnyTreeRow; tabIndex: number }) {
  const { onToggle, rowHeight, maxDepth } = useTreeContext();
  return (
    <RenderExpandToggle
      expanded={row._isExpanded}
      hasChildren={row._hasChildren}
      rowHeight={rowHeight}
      depth={row._depth}
      isLastChild={row._isLastChild}
      parentIsLastChild={row._parentIsLastChild}
      maxDepth={maxDepth}
      tabIndex={tabIndex}
      onToggle={() => onToggle(row.id)}
    />
  );
}

const def: ColumnOrColumnGroup<AnyTreeRow> = {
  key: expandToggleColumnKey,
  name: '',
  width: 36,
  minWidth: 36,
  maxWidth: 36,
  // When the row has a toggle button, suppress the default cell focus outline and
  // re-render the focus ring on the button itself for a tighter visual. Leaf rows
  // have no button to receive the ring, so they keep the default cell outline:
  // otherwise keyboard focus on a leaf would be invisible (WCAG 2.4.7).
  cellClass: (row) =>
    row._hasChildren
      ? 'flex items-center justify-center !p-0 aria-selected:outline-none aria-selected:[&_[data-slot=expand-toggle]]:ring-2 aria-selected:[&_[data-slot=expand-toggle]]:ring-ring aria-selected:[&_[data-slot=expand-toggle]]:ring-offset-2 aria-selected:[&_[data-slot=expand-toggle]]:ring-offset-background'
      : 'flex items-center justify-center !p-0',
  renderCell: ({ row, tabIndex }) => <ExpandToggleCell row={row} tabIndex={tabIndex ?? -1} />,
};

/**
 * Drop-in column for tree-style data tables. Reads expansion handlers and
 * row height from `<TreeProvider>`; reads `_isExpanded`, `_hasChildren`,
 * `_depth`, `_isLastChild`, `_parentIsLastChild`, and `id` off each row.
 *
 * Pair with {@link useTreeRows} to populate those fields automatically. The
 * column is structurally compatible with any `TreeRow<T>`, so you can drop
 * it into a typed columns array without a factory call.
 */
// biome-ignore lint/suspicious/noExplicitAny: column is structurally compatible with any TreeRow<T>; the cast keeps consumers from needing a factory.
export const ExpandToggleColumn = def as ColumnOrColumnGroup<any>;
