import { RenderExpandToggle } from '~/modules/common/data-grid/cell-renderers';
import type { TreeRow } from '~/modules/common/data-table/tree/build-tree';
import { useTreeContext } from '~/modules/common/data-table/tree/tree-context';
import type { ColumnOrColumnGroup } from '~/modules/common/data-table/types';
import { cn } from '~/utils/cn';

const expandToggleColumnKey = 'expand-toggle-column';

/** Minimal row contract this column reads; any {@link buildTree} output satisfies it. */
type AnyTreeRow = TreeRow<{ id: string }>;

interface ExpandToggleCellProps {
  row: AnyTreeRow;
  tabIndex: number;
}

/** Separate component so `useTreeContext()` runs inside a React render, not in the renderCell callback. */
function ExpandToggleCell({ row, tabIndex }: ExpandToggleCellProps) {
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

const column: ColumnOrColumnGroup<AnyTreeRow> = {
  key: expandToggleColumnKey,
  name: '',
  width: 36,
  minWidth: 36,
  maxWidth: 36,
  // Focus ring moves to the toggle button; leaf rows keep the cell outline.
  cellClass: (row) =>
    cn(
      'justify-center p-0',
      row._hasChildren &&
        'aria-selected:outline-hidden aria-selected:[&_[data-slot=expand-toggle]]:ring-2 aria-selected:[&_[data-slot=expand-toggle]]:ring-ring aria-selected:[&_[data-slot=expand-toggle]]:ring-offset-2 aria-selected:[&_[data-slot=expand-toggle]]:ring-offset-background',
    ),
  renderCell: ({ row, tabIndex }) => <ExpandToggleCell row={row} tabIndex={tabIndex} />,
};

/** Drop-in tree-table column using {@link TreeProvider} handlers and rows from {@link useTreeRows}. */
// biome-ignore lint/suspicious/noExplicitAny: column is structurally compatible with any TreeRow<T>; the cast keeps consumers from needing a factory.
export const ExpandToggleColumn = column as ColumnOrColumnGroup<any>;
