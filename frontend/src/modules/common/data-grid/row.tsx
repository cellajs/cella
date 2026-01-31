import { memo, useMemo } from 'react';
import { useDefaultRenderers } from './data-grid-default-renderers-context';
import { RowSelectionContext, type RowSelectionContextValue, useLatestFunc } from './hooks';
import { MobileExpandToggle, MobileSubRow } from './mobile-sub-row';
import { rowClassname, rowSelectedClassname } from './style/row';
import type { CalculatedColumn, RenderRowProps } from './types';
import { classnames, getCellRangeBoundary, getColSpan, getRowStyle, isCellInRange } from './utils';

function Row<R, SR>({
  className,
  rowIdx,
  gridRowStart,
  selectedCellIdx,
  isRowSelectionDisabled,
  isRowSelected,
  draggedOverCellIdx,
  lastFrozenColumnIndex,
  row,
  viewportColumns,
  selectedCellEditor,
  onCellMouseDown,
  onCellClick,
  onCellDoubleClick,
  onCellContextMenu,
  rowClass,
  onRowChange,
  selectCell,
  selectedCellRange,
  subColumns,
  isRowExpanded,
  onToggleRowExpand,
  style,
  ...props
}: RenderRowProps<R, SR>) {
  const renderCell = useDefaultRenderers<R, SR>()!.renderCell!;

  const handleRowChange = useLatestFunc((column: CalculatedColumn<R, SR>, newRow: R) => {
    onRowChange(column, rowIdx, newRow);
  });

  const handleToggleExpand = useLatestFunc(() => {
    onToggleRowExpand?.(rowIdx);
  });

  const hasSubColumns = (subColumns?.length ?? 0) > 0;

  className = classnames(
    rowClassname,
    `rdg-row-${rowIdx % 2 === 0 ? 'even' : 'odd'}`,
    {
      [rowSelectedClassname]: selectedCellIdx === -1,
      'rdg-row-expandable': hasSubColumns,
      'rdg-row-expanded': isRowExpanded === true,
    },
    rowClass?.(row, rowIdx),
    className,
  );

  const cells = [];

  // Add expand toggle as first element if we have sub-columns
  if (hasSubColumns) {
    cells.push(
      <MobileExpandToggle
        key="__expand_toggle__"
        isExpanded={isRowExpanded ?? false}
        onToggle={handleToggleExpand}
        hasSubColumns={hasSubColumns}
      />,
    );
  }

  for (let index = 0; index < viewportColumns.length; index++) {
    const column = viewportColumns[index];
    const { idx } = column;
    const colSpan = getColSpan(column, lastFrozenColumnIndex, { type: 'ROW', row });
    if (colSpan !== undefined) {
      index += colSpan - 1;
    }

    const isCellSelected = selectedCellIdx === idx;

    // Check if cell is in selected range
    const position = { idx, rowIdx };
    const isInSelectedRange = selectedCellRange ? isCellInRange(position, selectedCellRange) : false;
    const rangeBoundary =
      isInSelectedRange && selectedCellRange ? getCellRangeBoundary(position, selectedCellRange) : undefined;

    if (isCellSelected && selectedCellEditor) {
      cells.push(selectedCellEditor);
    } else {
      cells.push(
        renderCell(column.key, {
          column,
          colSpan,
          row,
          rowIdx,
          isDraggedOver: draggedOverCellIdx === idx,
          isCellSelected,
          isInSelectedRange,
          rangeBoundary,
          onCellMouseDown,
          onCellClick,
          onCellDoubleClick,
          onCellContextMenu,
          onRowChange: handleRowChange,
          selectCell,
        }),
      );
    }
  }

  const selectionValue = useMemo(
    (): RowSelectionContextValue => ({ isRowSelected, isRowSelectionDisabled }),
    [isRowSelectionDisabled, isRowSelected],
  );

  return (
    <RowSelectionContext value={selectionValue}>
      <div
        role="row"
        className={className}
        style={{
          ...getRowStyle(gridRowStart),
          ...style,
        }}
        {...props}
      >
        {cells}
      </div>
      {hasSubColumns && subColumns && (
        <MobileSubRow row={row} rowIdx={rowIdx} subColumns={subColumns} isExpanded={isRowExpanded ?? false} />
      )}
    </RowSelectionContext>
  );
}

const RowComponent = memo(Row) as <R, SR>(props: RenderRowProps<R, SR>) => React.JSX.Element;

export default RowComponent;

export function defaultRenderRow<R, SR>(key: React.Key, props: RenderRowProps<R, SR>) {
  return <RowComponent key={key} {...props} />;
}
