import { RenderCheckbox } from './cell-renderers';
import { useHeaderRowSelection, useRowSelection } from './hooks/use-row-selection';
import type { Column, RenderCellProps, RenderGroupCellProps, RenderHeaderCellProps } from './types';

export const SELECT_COLUMN_KEY = 'rdg-select-column';

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

function SelectGroupFormatter(props: RenderGroupCellProps<unknown>) {
  const { isRowSelected, onRowSelectionChange } = useRowSelection();

  return (
    <RenderCheckbox
      aria-label="Select Group"
      tabIndex={props.tabIndex}
      checked={isRowSelected}
      onChange={(checked) => {
        onRowSelectionChange({ row: props.row, checked, isShiftClick: false });
      }}
    />
  );
}

// biome-ignore lint/suspicious/noExplicitAny: SelectColumn is row-shape agnostic; consumers narrow via Column<Row, SR>.
export const SelectColumn: Column<any, any> = {
  key: SELECT_COLUMN_KEY,
  name: '',
  width: 35,
  minWidth: 35,
  maxWidth: 35,
  cellClass:
    'rdg-cell-checkbox aria-selected:outline-none aria-selected:[&_[data-slot=checkbox]]:ring-2 aria-selected:[&_[data-slot=checkbox]]:ring-ring aria-selected:[&_[data-slot=checkbox]]:ring-offset-2 aria-selected:[&_[data-slot=checkbox]]:ring-offset-background aria-selected:[&_[data-slot=checkbox]]:rounded',
  headerCellClass:
    'rdg-cell-checkbox aria-selected:outline-none aria-selected:[&_[data-slot=checkbox]]:ring-2 aria-selected:[&_[data-slot=checkbox]]:ring-ring aria-selected:[&_[data-slot=checkbox]]:ring-offset-2 aria-selected:[&_[data-slot=checkbox]]:ring-offset-background aria-selected:[&_[data-slot=checkbox]]:rounded',
  renderHeaderCell(props) {
    return <HeaderRenderer {...props} />;
  },
  renderCell(props) {
    return <SelectFormatter {...props} />;
  },
  renderGroupCell(props) {
    return <SelectGroupFormatter {...props} />;
  },
};
