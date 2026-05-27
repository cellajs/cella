import { memo } from 'react';
import { useRovingTabIndex } from './hooks';
import type { CalculatedColumn, GroupRow } from './types';
import { getCellClassname, getCellStyle } from './utils/grid-utils';

interface GroupCellProps<R, SR> {
  id: string;
  groupKey: unknown;
  childRows: readonly R[];
  toggleGroup: (expandedGroupId: unknown) => void;
  isExpanded: boolean;
  column: CalculatedColumn<R, SR>;
  row: GroupRow<R>;
  isCellSelected: boolean;
  isCellSelectionEnabled: boolean;
  groupColumnIndex: number;
  isGroupByColumn: boolean;
}

function GroupCell<R, SR>({
  id,
  groupKey,
  childRows,
  isExpanded,
  isCellSelected,
  isCellSelectionEnabled,
  column,
  row,
  groupColumnIndex,
  isGroupByColumn,
  toggleGroup: toggleGroupWrapper,
}: GroupCellProps<R, SR>) {
  const roving = useRovingTabIndex(isCellSelected);
  const tabIndex = isCellSelectionEnabled ? roving.tabIndex : -1;
  const childTabIndex = isCellSelectionEnabled ? roving.childTabIndex : 0;
  const onFocus = isCellSelectionEnabled ? roving.onFocus : undefined;

  function toggleGroup() {
    toggleGroupWrapper(id);
  }

  // Only make the cell clickable if the group level matches
  const isLevelMatching = isGroupByColumn && groupColumnIndex === column.idx;

  return (
    <div
      role="gridcell"
      aria-colindex={column.idx + 1}
      aria-selected={isCellSelected}
      tabIndex={tabIndex}
      key={column.key}
      className={getCellClassname(
        column,
        !isCellSelectionEnabled &&
          'has-focus-visible:outline-2 has-focus-visible:outline-primary has-focus-visible:outline-solid has-focus-visible:-outline-offset-2',
      )}
      style={{
        ...getCellStyle(column),
        cursor: isLevelMatching ? 'pointer' : 'default',
      }}
      onMouseDown={(event) => {
        // prevents clicking on the cell from stealing focus from focusSink
        event.preventDefault();
      }}
      onClick={isLevelMatching ? toggleGroup : undefined}
      onFocus={onFocus}
    >
      {(!isGroupByColumn || isLevelMatching) &&
        column.renderGroupCell?.({
          groupKey,
          childRows,
          column,
          row,
          isExpanded,
          tabIndex: childTabIndex,
          toggleGroup,
        })}
    </div>
  );
}

const GroupCellMemo = memo(GroupCell) as <R, SR>(props: GroupCellProps<R, SR>) => React.JSX.Element;

export { GroupCellMemo as GroupCell };
