import { RenderExpandToggle } from '~/modules/common/data-grid/cell-renderers';
import type { ColumnOrColumnGroup } from '~/modules/common/data-table/types';
import type { TreeRow } from './build-tree';
import { useTreeContext } from './tree-context';

export const expandToggleColumnKey = 'expand-toggle-column';

/** Minimal row contract this column reads; any {@link buildTree} output satisfies it. */
type AnyTreeRow = TreeRow<{ id: string }>;

/** Separate component so `useTreeContext()` runs inside a React render, not in the renderCell callback. */
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
  // Focus ring moves to the toggle button; leaf rows keep the cell outline.
  cellClass: (row) =>
    row._hasChildren
      ? 'flex items-center justify-center !p-0 aria-selected:outline-none aria-selected:[&_[data-slot=expand-toggle]]:ring-2 aria-selected:[&_[data-slot=expand-toggle]]:ring-ring aria-selected:[&_[data-slot=expand-toggle]]:ring-offset-2 aria-selected:[&_[data-slot=expand-toggle]]:ring-offset-background'
      : 'flex items-center justify-center !p-0',
  renderCell: ({ row, tabIndex }) => <ExpandToggleCell row={row} tabIndex={tabIndex ?? -1} />,
};

/** Drop-in tree-table column using {@link TreeProvider} handlers and rows from {@link useTreeRows}. */
// biome-ignore lint/suspicious/noExplicitAny: column is structurally compatible with any TreeRow<T>; the cast keeps consumers from needing a factory.
export const ExpandToggleColumn = def as ColumnOrColumnGroup<any>;
