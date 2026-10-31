import { RenderCheckbox } from './cell-renderers';
import { useHeaderRowSelection, useRowSelection } from './hooks/use-row-selection';
import type { Column, RenderCellProps, RenderHeaderCellProps } from './types';

export const selectColumnKey = 'rdg-select-column';

function HeaderRenderer(props: RenderHeaderCellProps<unknown>) {
  const { isIndeterminate, isRowSelected, onRowSelectionChange } = useHeaderRowSelection();

  return (
    <RenderCheckbox
      aria-label="Select All"
      tabIndex={props.tabIndex}
      indeterminate={isIndeterminate}
      checked={isRowSelected}
      onChange={(checked) => {
        onRowSelectionChange({ checked: isIndeterminate ? false : checked });
      }}
    />
  );
}

function SelectFormatter(props: RenderCellProps<unknown>) {
  const { isRowSelectionDisabled, isRowSelected, onRowSelectionChange } = useRowSelection();

  return (
    <RenderCheckbox
      aria-label="Select"
      tabIndex={props.tabIndex}
      disabled={isRowSelectionDisabled}
      checked={isRowSelected}
      onChange={(checked, isShiftClick) => {
        onRowSelectionChange({ row: props.row, checked, isShiftClick });
      }}
    />
  );
}

// biome-ignore lint/suspicious/noExplicitAny: SelectColumn is row-shape agnostic; consumers narrow via Column<Row, SR>.
export const SelectColumn: Column<any, any> = {
  key: selectColumnKey,
  name: '',
  width: 35,
  minWidth: 35,
  maxWidth: 35,
  // The checkbox draws its own ring
  cellClass: 'rdg-cell-checkbox focus-ring:not-data-pointer-focus:has-focus-visible:outline-hidden',
  headerCellClass: 'rdg-cell-checkbox focus-ring:not-data-pointer-focus:has-focus-visible:outline-hidden',
  renderHeaderCell(props) {
    return <HeaderRenderer {...props} />;
  },
  renderCell(props) {
    return <SelectFormatter {...props} />;
  },
};
